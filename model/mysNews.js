import fs from "fs"
import YAML from "yaml"
import fetch from "node-fetch"
import lodash from "lodash"
import puppeteer from "../../../lib/puppeteer/puppeteer.js"
import common from "../../../lib/common/common.js"
import gsCfg from "../model/gsCfg.js"
import base from "./base.js"

let emoticon

export default class MysNews extends base {
    constructor(e) {
        super(e)
        this.model = "mysNews"
    }

    async getNews(gid) {
        let type = 1
        let typeName = "公告"
        if (this.e.msg.includes("资讯")) {
            type = "3"
            typeName = "资讯"
        }
        if (this.e.msg.includes("活动")) {
            type = "2"
            typeName = "活动"
        }

        const res = await this.postData("getNewsList", { gids: gid, page_size: this.e.msg.includes("列表") ? 5 : 20, type })
        if (!res) return

        const data = res.data.list
        if (data.length == 0) {
            return true
        }

        let param = {}
        let game = this.game(gid)
        if (this.e.msg.includes("列表")) {
            this.model = "mysNews-list"
            data.forEach(element => {
                element.post.created_at = new Date(element.post.created_at * 1000).toLocaleString()
            })

            param = {
                ...this.screenData,
                saveId: this.e.user_id,
                data,
                game,
                typeName
            }
        } else {
            const page = this.e.msg.replace(/#|＃|官方|星铁|原神|崩坏三|崩三|绝区零|崩坏二|崩二|崩坏学园二|未定|未定事件簿|公告|资讯|活动/g, "").trim() || 1
            if (page > data.length) {
                await this.e.reply("目前只查前20条最新的公告，请输入1-20之间的整数。")
                return true
            }

            const postId = data[page - 1].post.post_id

            param = await this.newsDetail(postId, gid)
        }

        const img = await this.render(param)
        return this.replyMsg(img, `${game}${typeName}：${param?.data?.post?.subject || `米游社${game}${typeName}列表`}`)
    }

    render(param) {
        return puppeteer.screenshots(this.model, param)
    }

    async newsDetail(postId, gid) {
        const res = await this.postData("getPostFull", { gids: gid, read: 1, post_id: postId })
        if (!res) return

        const data = await this.detalData(res.data.post, gid)

        return {
            ...this.screenData,
            saveId: postId,
            dataConent: data.post.content,
            data
        }
    }

    postApi(type, data) {
        let host = "https://bbs-api.miyoushe.com/"
        let param = []
        lodash.forEach(data, (v, i) => param.push(`${i}=${v}`))
        param = param.join("&")
        switch (type) {
            // 搜索
            case "searchPosts":
                host = "https://bbs-api.miyoushe.com/post/wapi/searchPosts?"
                break
            case "userInstantSearchPosts":
                host = "https://bbs-api.miyoushe.com/painter/api/user_instant/search/list?"
                break
            // 帖子详情
            case "getPostFull":
                host += "post/wapi/getPostFull?"
                break
            // 公告列表
            case "getNewsList":
                host = "https://bbs-api-static.miyoushe.com/painter/wapi/getNewsList?"
                break
            case "emoticon":
                host += "misc/api/emoticon_set?"
                break
        }
        return host + param
    }

    async postData(type, data) {
        const url = this.postApi(type, data)
        const headers = {
            "Referer": "https://www.miyoushe.com",
            "User-Agent": "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36"
        }
        let response
        try {
            response = await fetch(url, { method: "get", headers })
        } catch (error) {
            logger.error(error.toString())
            return false
        }

        if (!response.ok) {
            logger.error(`[米游社接口错误][${type}] ${response.status} ${response.statusText}`)
            return false
        }
        const res = await response.json()
        return res
    }

    async detalData(data, gid) {
        let json
        try {
            json = JSON.parse(data.post.content)
        } catch (error) {

        }

        if (typeof json == "object") {
            if (json.imgs && json.imgs.length > 0) {
                for (const val of json.imgs) {
                    data.post.content = ` <div class="ql-image-box"><img src="${val}?x-oss-process=image//resize,s_600/quality,q_80/auto-orient,0/interlace,1/format,png"></div>`
                }
            }
        } else {
            for (const img of data.post.images) {
                data.post.content = data.post.content.replace(img, img + "?x-oss-process=image//resize,s_600/quality,q_80/auto-orient,0/interlace,1/format,jpg")
            }

            if (!emoticon) {
                emoticon = await this.mysEmoticon(gid)
            }

            data.post.content = data.post.content.replace(/_\([^)]*\)/g, function(t, e) {
                t = t.replace(/_\(|\)/g, "")
                if (emoticon.has(t)) {
                    return `<img class="emoticon-image" src="${emoticon.get(t)}"/>`
                } else {
                    return ""
                }
            })

            const arrEntities = { lt: "<", gt: ">", nbsp: " ", amp: "&", quot: "\"" }
            data.post.content = data.post.content.replace(/&(lt|gt|nbsp|amp|quot);/ig, function(all, t) {
                return arrEntities[t]
            })
        }

        data.post.created_time = new Date(data.post.created_at * 1000).toLocaleString()

        for (const i in data.stat) {
            data.stat[i] = data.stat[i] > 10000 ? (data.stat[i] / 10000).toFixed(2) + "万" : data.stat[i]
        }

        return data
    }

    async mysEmoticon(gid) {
        const emp = new Map()

        const res = await this.postData("emoticon", { gids: gid })

        if (res.retcode != 0) {
            return emp
        }

        for (const val of res.data.list) {
            if (!val.icon) continue
            for (const list of val.list) {
                if (!list.icon) continue
                emp.set(list.name, list.icon)
            }
        }

        return emp
    }

    async mysSearch() {
        let msg = this.e.msg
        msg = msg.replace(/#|米游社|mys/g, "")

        if (!msg) {
            await this.e.reply("请输入关键字，如#米游社七七")
            return false
        }

        let page = msg.match(/.*(\d){1}$/) || 0
        if (page && page[1]) {
            page = page[1]
        }

        msg = lodash.trim(msg, page)

        let res = await this.postData("searchPosts", { gids: 2, size: 20, keyword: msg })
        if (!res) return

        if (res?.data?.posts.length <= 0) {
            await this.e.reply("搜索不到您要的结果，换个关键词试试呗~")
            return false
        }

        let postId = res.data.posts[page].post.post_id

        const param = await this.newsDetail(postId)

        const img = await this.render(param)

        return this.replyMsg(img, `${param.data.post.subject}`)
    }

    async mysUrl() {
        let msg = this.e.msg
        let postId = /[0-9]+/g.exec(msg)[0]

        if (!postId) return false

        const param = await this.newsDetail(postId)

        const img = await this.render(param)

        return this.replyMsg(img, `${param.data.post.subject}`)
    }

    async mysEstimate(keyword, uid) {
        let res = await this.postData("userInstantSearchPosts", { keyword, uid, size: 20, offset: 0, sort_type: 2 })
        let postList = res?.data?.list
        if (postList.length <= 0) {
            await this.e.reply("暂无数据")
            return false
        }
        let postId = postList[0].post.post.post_id
        if (!postId) {
            await this.e.reply("暂无数据")
            return false
        }

        const param = await this.newsDetail(postId)

        const img = await this.render(param)

        if (img.length > 1) {
            img.push(segment.image(param.data.post.images[0] + "?x-oss-process=image//resize,s_600/quality,q_80/auto-orient,0/interlace,1/format,jpg"))
        }

        return this.replyMsg(img, `${param.data.post.subject}`)
    }

    replyMsg(img, title) {
        if (!Array.isArray(img)) {
            img = [ img ]
        }
        if (!img || img.length <= 0) return false
        if (title) img = [ title, ...img ]
        if (img.length <= 20) return img
        return common.makeForwardMsg(this.e, [ img ])
    }

    async mysNewsTask() {
        let cfg = gsCfg.getConfig("mys", "pushNews")

        // 推送2小时内的公告资讯活动
        let interval = 7200
        // 最多同时推送两条
        this.maxNum = cfg.maxNum

        for (let gid of [ 1, 2, 3, 4, 6, 8 ]) {
            let type = gid == 1 ? "bbb" : gid == 2 ? "gs" : gid == 3 ? "bb" : gid == 4 ? "wd" : gid == 6 ? "sr" : "zzz"

            let news = []
            if (!lodash.isEmpty(cfg[`${type}announceGroup`])) {
                let anno = await this.postData("getNewsList", { gids: gid, page_size: 10, type: 1 })
                if (anno) anno.data.list.forEach(v => { news.push({ ...v, typeName: "公告", post_id: v.post.post_id }) })
            }
            if (!lodash.isEmpty(cfg[`${type}infoGroup`])) {
                let info = await this.postData("getNewsList", { gids: gid, page_size: 10, type: 3 })
                if (info) info.data.list.forEach(v => { news.push({ ...v, typeName: "资讯", post_id: v.post.post_id }) })
            }
            if (!lodash.isEmpty(cfg[`${type}activityGroup`])) {
                let info = await this.postData("getNewsList", { gids: gid, page_size: 10, type: 2 })
                if (info) info.data.list.forEach(v => { news.push({ ...v, typeName: "活动", post_id: v.post.post_id }) })
            }

            if (news.length <= 0) continue

            news = lodash.orderBy(news, [ "post_id" ], [ "asc" ])

            let now = Date.now() / 1000

            this.key = `Yz:${type}:mys:newPush:`
            this.e.isGroup = true
            this.pushGroup = []
            for (let val of news) {
                if (Number(now - val.post.created_at) > interval) { continue }
                if (cfg.banWord[type] && new RegExp(cfg.banWord[type]).test(val.post.subject)) { continue }
                if (val.typeName == "公告") {
                    for (let botId in cfg[`${type}announceGroup`]) {
                        for (let groupId of cfg[`${type}announceGroup`][botId]) { await this.sendNews(botId, groupId, val.typeName, val.post.post_id, gid) }
                    }
                }
                if (val.typeName == "资讯") {
                    for (let botId in cfg[`${type}infoGroup`]) {
                        for (let groupId of cfg[`${type}infoGroup`][botId]) { await this.sendNews(botId, groupId, val.typeName, val.post.post_id, gid) }
                    }
                }
                if (val.typeName == "活动") {
                    for (let botId in cfg[`${type}activityGroup`]) {
                        for (let groupId of cfg[`${type}activityGroup`][botId]) { await this.sendNews(botId, groupId, val.typeName, val.post.post_id, gid) }
                    }
                }
            }
        }
    }

    async ActivityPush() {
        let now = new Date()
        now = now.getHours()
        if (now < 10) return
        let pushGroupList
        try {
            pushGroupList = YAML.parse(fs.readFileSync("./plugins/genshin/config/mys.pushNews.yaml", "utf8"))
        } catch (error) {
            logger.error(`[米游社活动到期推送] 活动到期预警推送失败：无法获取配置文件信息\n${error}`)
            return
        }

        // 获取各游戏数据并整合
        let gsActivityList = await this.getGsActivity()
        let srActivityList = await this.getSrActivity()
        let bbbActivityList = await this.getBbbActivity()
        let zzzActivityList = await this.getZzzActivity()
        let ActivityList = []

        for (let item of srActivityList) {
            ActivityList.push({ game: "sr", subtitle: item.title?.replace(/<[^>]+>/g, ""), banner: item.img, title: item.title?.replace(/<[^>]+>/g, ""), end_time: item.end_time })
        }
        for (let item of gsActivityList) {
            ActivityList.push({ game: "gs", subtitle: (item.subtitle || "").replace(/<[^>]+>/g, ""), banner: item.banner, title: (item.title || "").replace(/<[^>]+>/g, ""), end_time: item.end_time })
        }
        for (let item of bbbActivityList) {
            ActivityList.push({ game: "bbb", subtitle: item.title?.replace(/<[^>]+>/g, ""), banner: item.img, title: item.title?.replace(/<[^>]+>/g, ""), end_time: item.end_time })
        }
        for (let item of zzzActivityList) {
            ActivityList.push({ game: "zzz", subtitle: item.title?.replace(/<[^>]+>/g, ""), banner: item.img, title: item.title?.replace(/<[^>]+>/g, ""), end_time: item.end_time })
        }

        logger.mark(`[调试] 准备推送的总活动数量: ${ActivityList.length}`)
        if (ActivityList.length === 0) return

        // 安全合并需要推送的机器ID和群组
        let BotidList = []
        let ActivityPushYaml = {}
        let allGames = [ pushGroupList.gsActivityPush, pushGroupList.srActivityPush, pushGroupList.bbbActivityPush, pushGroupList.zzzActivityPush ]
        for (let gameCfg of allGames) {
            if (!gameCfg) continue
            for (let botId in gameCfg) {
                if (!ActivityPushYaml[botId]) ActivityPushYaml[botId] = []
                ActivityPushYaml[botId].push(...gameCfg[botId])
            }
        }

        for (let botId in ActivityPushYaml) {
            ActivityPushYaml[botId] = lodash.uniq(ActivityPushYaml[botId])
            BotidList.push(botId)
        }

        logger.mark(`[调试] 当前开启了推送配置的Bot: ${BotidList.join(", ")}`)

        let date = await this.getDate()

        for (let botId of BotidList) {
            // 兼容 TRSS-Yunzai 获取 bot 实例
            let botInstance = Bot[botId] || Bot[Number(botId)]
            if (!botInstance && this.e && this.e.bot && (this.e.bot.uin == botId || this.e.bot.id == botId)) {
                botInstance = this.e.bot
            }

            if (!botInstance) {
                logger.mark(`[调试] 警告：无法获取 Bot[${botId}] 实例，已跳过。`)
                continue
            }

            let groupList = ActivityPushYaml[botId] || []

            // 遍历该 Bot 需要推送的所有群
            for (let groupId of groupList) {
                let groupStr = String(groupId)
                let pushSuccessCount = 0
                let shouldBreak = false // 记录本轮是否发过消息

                logger.mark(`[调试] 开始检查群 ${groupId} 需要推送的游戏...`)

                for (let a of ActivityList) {
                    // 【核心优化】把 Redis 缓存精确到单独的游戏： Yz:apgl:游戏简称:Bot号:群号
                    let redisKey = `Yz:apgl:${a.game}:${botId}:${groupId}`
                    let hasPushed = await redis.get(redisKey)

                    // 如果这个游戏今天已经给这个群推过了，就跳过它，检查下一个游戏
                    if (hasPushed === date) continue

                    let isGs = pushGroupList.gsActivityPush?.[botId]?.map(String).includes(groupStr) && a.game === "gs"
                    let isSr = pushGroupList.srActivityPush?.[botId]?.map(String).includes(groupStr) && a.game === "sr"
                    let isBbb = pushGroupList.bbbActivityPush?.[botId]?.map(String).includes(groupStr) && a.game === "bbb"
                    let isZzz = pushGroupList.zzzActivityPush?.[botId]?.map(String).includes(groupStr) && a.game === "zzz"

                    if (!isGs && !isSr && !isBbb && !isZzz) {
                        continue
                    }

                    let pushGame = { "sr": "星铁", "gs": "原神", "bbb": "崩三", "zzz": "绝区零" }[a.game]
                    let endDt = new Date(a.end_time.replace(/\s/, "T"))
                    let sydate = await this.calculateRemainingTime(new Date(), endDt)

                    let msgList = [
                        `【${pushGame}活动即将结束通知】`,
                        `\n活动:${a.subtitle}`,
                        segment.image(a.banner),
                        `描述:${a.title}`,
                        `\n活动剩余时间:${sydate.days}天${sydate.hours}小时${sydate.minutes}分钟${sydate.seconds}秒`,
                        `\n活动结束时间:${a.end_time}`
                    ]

                    logger.mark(`[米游社活动到期推送] 开始推送 ${botId}:${groupId} [${pushGame}] ${a.subtitle}`)
                    pushSuccessCount++
                    shouldBreak = true // 标记今天对这个群发过言了

                    await common.sleep(5000)
                    botInstance.pickGroup(groupId).sendMsg(msgList)
                        .then(() => { }).catch((err) => logger.error(`[米游社活动到期推送] 推送失败，错误信息${err}`))

                    // 仅对当前推送成功的游戏打上日期戳
                    await redis.set(redisKey, date, { EX: 3600 * 24 })
                }

                if (pushSuccessCount === 0) {
                    logger.mark(`[调试] 群 ${groupId} 没有需要推送的新活动`)
                }

                if (shouldBreak) {
                    // 防风控：如果刚才发过消息了，立刻退出循环，剩下的群等下一次定时任务触发
                    break
                }
            }
        }
    }

    async getDate() {
        const currentDate = new Date()
        const year = currentDate.getFullYear()
        const month = (currentDate.getMonth() + 1).toString().padStart(2, "0")
        const day = currentDate.getDate().toString().padStart(2, "0")
        return `${year}-${month}-${day}`
    }

    async getGsActivity() {
        let gshd
        try {
            gshd = await fetch("https://hk4e-api.mihoyo.com/common/hk4e_cn/announcement/api/getAnnList?game=hk4e&game_biz=hk4e_cn&lang=zh-cn&bundle_id=hk4e_cn&platform=pc&region=cn_gf01&level=55&uid=100000000")
            gshd = await gshd.json()
        } catch {
            return []
        }
        let hdlist = []
        let result = []
        for (let item of gshd.data.list[1].list) {
            if (item.type_label.includes("活动公告") && !item.title?.includes("冒险助力礼包") && !item.title?.includes("七圣")) hdlist.push(item)
        }
        for (let item of hdlist) {
            let endDt = item.end_time
            endDt = endDt.replace(/\s/, "T")
            let todayt = new Date()
            endDt = new Date(endDt)
            let sydate = await this.calculateRemainingTime(todayt, endDt)
            if (sydate.days <= 2) result.push(item)
        }
        return result
    }

    async getSrActivity() {
        let srhd
        try {
            srhd = await fetch("https://hkrpg-api.mihoyo.com/common/hkrpg_cn/announcement/api/getAnnList?game=hkrpg&game_biz=hkrpg_cn&lang=zh-cn&auth_appid=announcement&authkey_ver=1&bundle_id=hkrpg_cn&channel_id=1&level=65&platform=pc&region=prod_gf_cn&sdk_presentation_style=fullscreen&sdk_screen_transparent=true&sign_type=2&uid=100000000")
            srhd = await srhd.json()
        } catch {
            return []
        }
        let hdlist = []
        let result = []
        for (let item of srhd.data.pic_list[0].type_list[0].list) {
            if (
                // 条件：(标题包含"活动") 或者 (标签包含"资讯" 并且 标题既不含"签到" 也不含"PV")
                item.title?.includes("活动") ||
                (item.type_label?.includes("资讯") && !item.title?.includes("签到") && !item.title?.includes("PV"))
            )
                hdlist.push(item)

        }
        for (let item of hdlist) {
            let endDt = item.end_time
            endDt = endDt.replace(/\s/, "T")
            let todayt = new Date()
            endDt = new Date(endDt)
            let sydate = await this.calculateRemainingTime(todayt, endDt)
            if (sydate.days <= 2) result.push(item)
        }
        return result
    }

    async getZzzActivity() {
        let zzzhd
        try {
            zzzhd = await fetch("https://announcement-api.mihoyo.com/common/nap_cn/announcement/api/getAnnList?game=nap&game_biz=nap_cn&lang=zh-cn&bundle_id=nap_cn&platform=pc&region=prod_gf_cn&level=60&uid=100000000")
            zzzhd = await zzzhd.json()
        } catch {
            return []
        }
        let hdlist = []
        let result = []
        for (let item of zzzhd.data.pic_list[0].type_list[0].list) {
            if (
                item.title?.includes("活动") ||
                (item.type_label?.includes("资讯") && !item.title?.includes("主线") && !item.title?.includes("上新"))
            ) hdlist.push(item)
        }
        for (let item of hdlist) {
            let endDt = item.end_time
            endDt = endDt.replace(/\s/, "T")
            let todayt = new Date()
            endDt = new Date(endDt)
            let sydate = await this.calculateRemainingTime(todayt, endDt)
            if (sydate.days <= 5) result.push(item)
        }
        return result
    }

    async getBbbActivity() {
        let bbbhd;
        let fetchSuccess = false;

        // 尝试请求最多 3 次，防止海外服务器连接国内直连节点超时抽风
        for (let i = 0; i < 3; i++) {
            try {
                // node-fetch 支持直接传入 timeout 参数（单位毫秒）
                let res = await fetch("https://ann-api.mihoyo.com/common/bh3_cn/announcement/api/getAnnList?game=bh3&game_biz=bh3_cn&lang=zh-cn&bundle_id=bh3_cn&channel_id=14&level=88&platform=pc&region=bb01&uid=100000000", {
                    timeout: 8000 // 8秒连不上直接切断，进入重试
                })
                bbbhd = await res.json()
                fetchSuccess = true
                break // 请求成功，立刻跳出重试循环
            } catch (e) {
                logger.mark(`[网络波动] 崩三API 第 ${i + 1} 次请求超时，正在重试...`)
                await common.sleep(2000) // 延迟2秒后重试
            }
        }

        // 如果 3 次全失败，安全退出，返回空数组，不影响后续其他游戏的推送
        if (!fetchSuccess) {
            logger.error("[崩三API报错] 连续3次请求超时，海外服务器直连国内节点受阻，放弃本次获取。")
            return []
        }

        let hdlist = []
        let result = []

        // 崩三的数据结构在 data.list 下，需要两层循环提取
        if (bbbhd?.data?.list) {
            for (let lst of bbbhd.data.list) {
                if (!lst.list) continue
                for (let item of lst.list) {
                    if ( (item.type_label?.includes("活动") && !item.title?.includes("补给") && !item.title?.includes("跃升武装") && !item.title?.includes("礼包") && !item.title?.includes("凭证") && !item.title?.includes("七日登录"))) {
                        item.img = item.banner || item.img || ""
                        hdlist.push(item)
                    }
                }
            }
        }

        for (let item of hdlist) {
            if (!item.end_time) continue
            let endDt = item.end_time.replace(/\s/, "T")
            let todayt = new Date()
            endDt = new Date(endDt)
            let sydate = await this.calculateRemainingTime(todayt, endDt)
            if (endDt - todayt > 0 && sydate.days <= 7) result.push(item)
        }
        return result
    }

    async calculateRemainingTime(startDate, endDate) {
        const difference = endDate - startDate

        const days = Math.floor(difference / (1000 * 60 * 60 * 24))
        const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60))
        const seconds = Math.floor((difference % (1000 * 60)) / 1000)

        return { days, hours, minutes, seconds }
    }

    async sendNews(botId, groupId, typeName, postId, gid) {
        if (!this.pushGroup[groupId]) this.pushGroup[groupId] = 0
        if (this.pushGroup[groupId] >= this.maxNum) return

        let sended = await redis.get(`${this.key}${botId}:${groupId}:${postId}`)
        if (sended) return

        let game = this.game(gid)
        // 判断是否存在群关系
        this.e.group = Bot[botId]?.pickGroup(groupId)
        if (!this.e.group) {
            logger.mark(`[米游社${game}${typeName}推送] 群${botId}:${groupId}未关联`)
            return
        }

        if (!this[postId]) {
            const param = await this.newsDetail(postId, gid)

            logger.mark(`[米游社${game}${typeName}推送] ${param.data.post.subject}`)

            this[postId] = {
                img: await this.render(param),
                title: param.data.post.subject
            }
        }

        this.pushGroup[groupId]++
        await redis.set(`${this.key}${botId}:${groupId}:${postId}`, "1", { EX: 3600 * 10 })
        // 随机延迟10-90秒
        await common.sleep(lodash.random(10000, 90000))
        const msg = await this.replyMsg(this[postId].img, `${game}${typeName}推送：${this[postId].title}`)
        return this.e.group.sendMsg(msg)
    }

    game(gid) {
        switch (gid) {
            case 1:
                return "崩坏三"
            case 2:
                return "原神"
            case 3:
                return "崩坏二"
            case 4:
                return "未定事件簿"
            case 6:
                return "崩坏星穹铁道"
            case 8:
                return "绝区零"
        }
        return ""
    }
}