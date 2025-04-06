/** 导入plugin */
import plugin from '../../../lib/plugins/plugin.js'
import gsCfg from '../model/gsCfg.js'
import common from '../../../lib/common/common.js'
import lodash from 'lodash'
import fs from 'node:fs'
import fetch from 'node-fetch'

gsCfg.cpCfg('mys', 'set')

/**
 * Modify By: ifeng0188
 * 1.增加多个来源的攻略图
 * 2.优化获取攻略图逻辑，更改为对比图片大小来寻找
 * 3.增加攻略说明、设置默认攻略功能
 *
 * 从拓展插件更新
 * 作者：曉K 更新：🌌
 */

export class strategy extends plugin {
  constructor () {
    super({
      name: '米游社攻略',
      dsc: '米游社攻略图',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: '^#?(更新)?\\S+攻略([1-9])?$',
          fnc: 'strategy'
        },
        {
          reg: '^#?攻略(说明|帮助)?$',
          fnc: 'strategy_help'
        },
        {
          reg: '^#?设置默认攻略([1-9])?$',
          fnc: 'strategy_setting'
        }
      ]
    })

    this.set = gsCfg.getConfig('mys', 'set')

    this.path = './temp/strategy'

    this.url = 'https://bbs-api.mihoyo.com/post/wapi/getPostFullInCollection?&gids=2&order_type=2&collection_id='
    this.collection_id = [
      [],
      // 来源：西风驿站
      [2319292, 2319293, 2319295, 2319296, 2319299, 2319294, 2319298, 642956],
      // 来源：HoYo青枫
      [1751099],
      // 来源：Asgater
      [2226204,1549466,613],
      // 来源：OH是姜姜呀(需特殊处理)
      [341523],
      // 来源：荧岁镇太辰
      [2558464],
      // 来源：洛羽Lox
      [2489120],
      // 来源：阿巴辣
      [1866901],
      // 来源：地底Tv
      [2342915],
      // 来源：婧枫赛赛
      [1812949]
    ]

    this.source = ['西风驿站', 'HoYo青枫', 'Asgater', 'OH是姜姜呀', '荧岁镇太辰', '洛羽Lox', '阿巴辣', '地底Tv', '婧枫赛赛']

    this.oss = '?x-oss-process=image//resize,s_1200/quality,q_90/auto-orient,0/interlace,1/format,jpg'
  }

  /** 初始化创建配置文件 */
  async init () {
    if (!fs.existsSync(this.path)) {
      fs.mkdirSync(this.path)
    }
    /** 初始化子目录 */
    for (let subId of [1, 2, 3, 4, 5, 6, 7]) {
      let path = this.path + '/' + subId
      if (!fs.existsSync(path)) {
        fs.mkdirSync(path)
      }
    }
  }

  /** #心海攻略 */
  async strategy () {
    let match = /^#?(更新)?(\S+)攻略([1-9])?$/.exec(this.e.msg)

    // let isUpdate = !!this.e.msg.includes('更新')
    let isUpdate = !!match[1]
    let roleName = match[2]
    let group = match[3] ? match[3] : this.set.defaultSource

    let role = gsCfg.getRole(roleName)

    if (!role) return false

    /** 主角特殊处理 */
    if (['10000005', '10000007', '20000000'].includes(String(role.roleId))) {
      let travelers = ['风主', '岩主', '雷主', '草主', '水主', '火主']
      if (!travelers.includes(role.alias)) {
        let msg = '请选择：'
        for (let sub of travelers) {
          msg += `${sub}攻略${group}、`
        }
        msg = msg.substring(0, msg.lastIndexOf('、'))
        await this.e.reply(msg)
        return
      } else {
        role.name = role.alias
      }
    }

    this.sfPath = `${this.path}/${group}/${role.name}.jpg`
    let button = []
    for (const i of [1, 2, 3, 4, 5, 6, 7,8,9])
      button.push({ text: String(i), callback: `#${role.name}攻略${i}` })
    button = segment.button(button)

    if (fs.existsSync(this.sfPath) && !isUpdate) {
      await this.e.reply([segment.image(`file://${this.sfPath}`), button])
      return
    }

    if (await this.getImg(role.name, group)) {
      await this.e.reply([segment.image(`file://${this.sfPath}`), button])
    }
  }

  /** #攻略帮助 */
  async strategy_help () {      
    await this.e.reply('攻略帮助:\n#心海攻略[123456789]\n#更新早柚攻略[123456789]\n#设置默认攻略[123456789]\n示例: 心海攻略4\n\n攻略来源:\n1——西风驿站（猫冬）\n2——HoYo青枫\n3——Asgater\n4——OH是姜姜呀\n5——荧岁镇太辰\n6——洛羽Lox\n7——阿巴辣\n8——地底Tv\n9——婧枫赛赛')
  }

  /** #设置默认攻略1 */
  async strategy_setting () {
    let match = /^#?设置默认攻略([1-9])?$/.exec(this.e.msg)
    let set = './plugins/genshin/config/mys.set.yaml'
    let config = fs.readFileSync(set, 'utf8')
    let num = Number(match[1])
    if(isNaN(num)) {
		await this.e.reply('默认攻略设置方式为: \n#设置默认攻略[123456789] \n 请增加数字1-9其中一个')
		return
    }
    config = config.replace(/defaultSource: [1-9]/g, 'defaultSource: ' + num)
    fs.writeFileSync(set, config, 'utf8')

    await this.e.reply('默认攻略已设置为: ' + match[1])
  }

  /** 下载攻略图 */
  async getImg (name, group) {
    let msyRes = []
    this.collection_id[group].forEach((id) => msyRes.push(this.getData(this.url + id)))

    try {
      msyRes = await Promise.all(msyRes)
    } catch (error) {
      this.e.reply('暂无攻略数据，请稍后再试')
      logger.error(`米游社接口报错：${error}}`)
      return false
    }

    let posts = lodash.flatten(lodash.map(msyRes, (item) => item.data.posts))
    let url
    for (let val of posts) {
      /** 攻略图个别来源特殊处理 */
      if (group == 4) {
        if (val.post.structured_content.includes(name + '】')) {
          let content = val.post.structured_content.replace(/\\\/\{\}/g, '')
          let pattern = new RegExp(name + '】.*?image\\\\?":\\\\?"(.*?)\\\\?"');  // 常驻角色兼容
          let imgId = pattern.exec(content)[1]
          for (let image of val.image_list) {
            if (image.image_id == imgId) {
              url = image.url
              break
            }
          }
          break
        }
      } else {
        if (val.post.subject.includes(name)) {
          let max = 0
          val.image_list.forEach((v, i) => {
            if (Number(v.size) >= Number(val.image_list[max].size)) max = i
          })
          url = val.image_list[max].url
          break
        }
      }
    }

    if (!url) {
      this.e.reply([`暂无${name}攻略（${this.source[group - 1]}）\n请尝试其他的攻略来源查询\n#攻略帮助，查看说明`, segment.button([
        { text: "攻略帮助", callback: "#攻略帮助" },
      ])])
      return false
    }

    logger.mark(`${this.e.logFnc} 下载${name}攻略图`)

    if (!await common.downFile(url + this.oss, this.sfPath)) {
      return false
    }

    logger.mark(`${this.e.logFnc} 下载${name}攻略成功`)

    return true
  }

  /** 获取数据 */
  async getData (url) {
    let response = await fetch(url, { method: 'get' })
    if (!response.ok) {
      return false
    }
    const res = await response.json()
    return res
  }
}
