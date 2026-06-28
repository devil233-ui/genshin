import plugin from "../../../lib/plugins/plugin.js"
import gsCfg from "../model/gsCfg.js"
import User from "../model/user.js"

export class user extends plugin {
  constructor(e) {
    super({
      name: "用户绑定",
      dsc: "米游社ck绑定，游戏uid绑定",
      event: "message",
      priority: 300,
      rule: [
        {
          reg: "^([#\\*%!￥&])?(体力|[Cc](oo)?[Kk](ie)?)帮助",
          fnc: "ckHelp"
        },
        {
          reg: "^([#\\*%!￥&])[Cc](oo)?[Kk](ie)?代码$",
          fnc: "ckCode"
        },
        {
          reg: /^([#\\*%!￥&])绑定c(oo)?k(ie)?$/i,
          fnc: "bindCk"
        },
        {
          reg: "(.*)_MHYUUID(.*)",
          event: "message.private",
          fnc: "noLogin"
        },
        {
          reg: /^([#\\*%!￥&])?(原神|星铁|绝区零|崩三|崩坏三)?我的c(oo)?k(ie)?$/i,
          event: "message",
          fnc: "myCk"
        },
        {
          reg: /^([#\\*%!￥&])?(原神|星铁|绝区零|崩三|崩坏三)?删除c(oo)?k(ie)?$/i,
          fnc: "delCk"
        },
        {
          reg: /^([#\\*%!￥&])?(原神|星铁|绝区零|崩三|崩坏三)?(删除|解绑)uid(\s|\+)*([0-9]{1,2})?$/i,
          fnc: "delUid"
        },
        {
          // 修正了祖传的 bingUid 拼写错误
          reg: /^([#\\*%!￥&])?(原神|星铁|绝区零|崩三|崩坏三)?绑定(uid)?(\s|\+)*((1[0-9]|[1-9])[0-9]{8}|[1-9][0-9]{7,8})$/i,
          fnc: "bindUid"
        },
        {
          reg: /^([#\\*%!￥&])?(原神|星铁|绝区零|崩三|崩坏三)?(我的)?(uid)[0-9]{0,2}$/i,
          fnc: "showUid"
        },
        {
          reg: /^([#\\*%!￥&])?\s*(检查|我的)*c(oo)?k(ie)?(状态)*$/i,
          fnc: "checkCkStatus"
        },
        {
          reg: "^#(接受)?绑定(主|子)?(用户|账户|账号)(\\[[a-zA-Z0-9_\\-:\\]+\\]){0,2}$",
          fnc: "bindNoteUser"
        },
        {
          reg: "^#(删除绑定|取消绑定|解除绑定|解绑|删除|取消)(主|子)(用户|账户|账号)$",
          fnc: "bindNoteUser"
        }
      ]
    })
    this.User = new User(e)
  }

  async init() {
    await this.loadOldData()
  }

  /** 接受到消息都会执行一次 */
  accept() {
    if (!this.e.msg) return
    let msg = this.e.msg

    // 全局识别前缀，彻底解决游戏乱串的问题
    if (/^!|！/.test(msg) || /崩三|崩坏三|崩坏3/.test(msg)) {
      this.e.game = "bh3"
    } else if (/^\*/.test(msg) || /星铁|铁道/.test(msg)) {
      this.e.game = "sr"
      this.e.isSr = true
    } else if (/^%/.test(msg) || /绝区零|zzz/.test(msg)) {
      this.e.game = "zzz"
    } else if (/^￥/.test(msg) || /崩坏学园2|崩二/.test(msg)) {
      this.e.game = "bh2"
    } else if (/^&/.test(msg) || /未定/.test(msg)) {
      this.e.game = "wd"
    } else if (/^#/.test(msg) || /原神/.test(msg)) {
      this.e.game = "gs"
    }

    if (/(ltoken|ltoken_v2)/.test(msg) && /(ltuid|login_uid|ltmid_v2)/.test(msg)) {
      if (this.e.isGroup) {
        this.reply("请私聊发送Cookie", false, { at: true })
        return true
      }
      this.e.ck = msg
      this.e.msg = "#绑定Cookie"
      return true
    }

    if (/绑定uid$/i.test(msg)) {
      let prompts = {
        "bh3": [ "saveBh3Uid", "崩坏三" ],
        "zzz": [ "saveZzzUid", "绝区零" ],
        "sr": [ "saveSrUid", "星铁" ],
        "gs": [ "saveUid", "原神" ]
      }
      let gameData = prompts[this.e.game] || prompts["gs"]
      this.setContext(gameData[0])
      this.reply(`请发送绑定的${gameData[1]}uid`, false, { at: true })
      return true
    }
  }

  saveUid() {
    if (!this.e.msg) return
    let uid = this.e.msg.match(/(18|[1-9])[0-9]{8}/g)
    if (!uid) { return this.reply("原神UID输入错误", false, { at: true }) }
    this.e.msg = "#绑定" + uid[0]
    this.bindUid()
    this.finish("saveUid")
  }

  saveSrUid() {
    if (!this.e.msg) return
    let uid = this.e.msg.match(/(18|[1-9])[0-9]{8}/g)
    if (!uid) { return this.reply("星铁UID输入错误", false, { at: true }) }
    this.e.msg = "*绑定" + uid[0]
    this.bindUid()
    this.finish("saveSrUid")
  }

  saveZzzUid() {
    if (!this.e.msg) return
    let uid = this.e.msg.match(/(1[0-9]|[1-9])[0-9]{8}|[1-9][0-9]{7}/g)
    if (!uid) { return this.reply("绝区零UID输入错误", false, { at: true }) }
    this.e.msg = "%绑定" + uid[0]
    this.bindUid()
    this.finish("saveZzzUid")
  }

  saveBh3Uid() {
    if (!this.e.msg) return
    let uid = this.e.msg.match(/[1-9][0-9]{7,8}/g)
    if (!uid) { return this.reply("崩坏三UID输入错误", false, { at: true }) }
    this.e.msg = "!绑定" + uid[0]
    this.bindUid()
    this.finish("saveBh3Uid")
  }

  async noLogin() { await this.reply("绑定Cookie失败\n请发送 #扫码登录，使用米游社扫码") }
  async ckCode() { await this.reply("javascript:(()=>{prompt('',document.cookie)})();") }
  async ckHelp() { await this.reply("请发送 #扫码登录，使用米游社扫码") }
  async bindCk() {
    if (!this.e.ck) return await this.reply("看伊涅芙手册去")
    await this.User.bing()
  }
  async delCk() { await this.reply(await this.User.delCk()) }
  async bindUid() { await this.User.bindUid() }
  async showUid() {
    let index = this.e.msg.match(/[0-9]{1,2}/g)
    if (index && index[0]) {
      await this.User.toggleUid(index[0])
    } else {
      await this.User.showUid()
    }
  }
  async delUid() {
    let index = this.e.msg.match(/[0-9]{1,2}$/g)
    if (!index) {
      this.e.reply("删除uid请带上序号\n例如：!删除uid1\n发送【!uid】可查看绑定的uid以及对应的序号")
      return true
    }
    await this.User.delUid(index[0])
  }
  async myCk() {
    if (this.e.isGroup) return await this.reply("请私聊查看")
    await this.User.myCk()
  }
  async loadOldData() {
    await this.User.loadOldDataV2()
    await this.User.loadOldDataV3()
    await this.User.loadOldUid()
  }
  async checkCkStatus() { await this.User.checkCkStatus() }
  async bindNoteUser() { await this.User.bindNoteUser() }
}