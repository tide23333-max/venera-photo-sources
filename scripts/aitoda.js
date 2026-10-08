// Aitoda / Nao Kanzaki. VeneraNext ComicSource, not a browser userscript.
// Image selectors inspired by DEX's MIT-licensed Full Picture Load rule.
class PhotoDeckAitodaSource extends ComicSource {
    name = "Aitoda · Nao Kanzaki"
    key = "photo_deck_aitoda"
    version = "0.1.3"
    minAppVersion = "1.17.0"
    constructor(){super();this.directoryInstall()}
    // Bound native category widgets, not the stored directory or reading data.
    directoryMemo = null
    directoryRawEntries() { return Array.isArray(this.catalog) ? this.catalog : (Array.isArray(this.labels) ? this.labels : []) }
    directoryLabel(entry) { return String(typeof entry === "string" ? entry : (entry?.name || entry?.label || "")) }
    directoryPageData() {
        const entries = this.directoryRawEntries(), state = this.loadData("directory_view_v1") || {}
        const query = String(state.query || "").trim().toLowerCase(), requested = Math.max(1, Math.floor(Number(state.page) || 1))
        const memo = this.directoryMemo
        if (memo && memo.entries === entries && memo.length === entries.length && memo.query === query && memo.requested === requested) return memo.result
        const filtered = entries.filter(e => this.directoryLabel(e).toLowerCase().includes(query))
            .sort((a,b) => {
                const x=this.directoryLabel(a).toUpperCase(), y=this.directoryLabel(b).toUpperCase()
                return x<y?-1:x>y?1:0
            })
        const pages = Math.max(1, Math.ceil(filtered.length / 30)), page = Math.min(requested,pages)
        const result = {items:filtered.slice((page-1)*30,page*30),page,pages,total:entries.length,matched:filtered.length,query}
        this.directoryMemo = {entries,length:entries.length,query,requested,result}
        return result
    }
    directoryWindow() { return this.directoryPageData().items }
    directoryNotice() {
        const d=this.directoryPageData()
        UI.showMessage("缓存 "+d.total+" 项，匹配 "+d.matched+" 项；第 "+d.page+"/"+d.pages+" 批，每批最多 30 项。修改后请重新进入分类页；完整缓存没有删除。")
    }
    directoryInstall() {
        this.settings={...(this.settings||{}),
            directorySearch:{title:"搜索缓存标签（不联网）",type:"callback",buttonText:"搜索／清空筛选",callback:async()=>{
                const text=await UI.showInputDialog("输入标签关键词；留空恢复全部缓存")
                if(text===null||text===undefined)return
                this.saveData("directory_view_v1",{query:String(text).trim(),page:1});this.directoryNotice()
            }},
            directoryPrevious:{title:"缓存目录：上一批",type:"callback",buttonText:"上一批",callback:()=>{
                const d=this.directoryPageData()
                this.saveData("directory_view_v1",{query:d.query,page:Math.max(1,d.page-1)});this.directoryNotice()
            }},
            directoryNext:{title:"缓存目录：下一批",type:"callback",buttonText:"下一批",callback:()=>{
                const d=this.directoryPageData()
                this.saveData("directory_view_v1",{query:d.query,page:Math.min(d.pages,d.page+1)});this.directoryNotice()
            }},
            directoryDisplayStatus:{title:"缓存目录显示状态",type:"callback",buttonText:"查看批次",callback:()=>this.directoryNotice()}
        }
    }
    url = "https://raw.githubusercontent.com/tide23333-max/venera-photo-sources/main/scripts/aitoda.js"
    site = "https://aitoda.blogspot.com"
    pageSize = 20
    metadata = {}
    details = {}
    pendingDetails = {}
    listPending = {}
    labelsPending = null
    labels = []
    userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

    cleanText(value) {
        return String(value ?? "").replace(/\s+/g, " ").trim()
    }

    plainText(html) {
        const doc = new HtmlDocument("<div>" + String(html ?? "") + "</div>")
        try { return this.cleanText(doc.querySelector("div")?.text) }
        finally { doc.dispose() }
    }

    canonicalId(value) {
        const raw = String(value ?? "").trim()
        const full = raw.startsWith("/") ? this.site + raw : raw
        const match = /^https?:\/\/aitoda\.blogspot\.com(\/\d{4}\/\d{2}\/[^/?#]+\.html)(?:[?#].*)?$/i.exec(full)
        return match ? this.site + match[1] : null
    }

    headers(accept = "text/html,application/xhtml+xml") {
        return { "User-Agent": this.userAgent, "Accept": accept, "Referer": this.site + "/" }
    }

    async request(url, accept) {
        const response = await Network.get(url, this.headers(accept))
        const body = String(response.body ?? "")
        if (/unusual traffic|automated queries|captcha-form|\/sorry\/index/i.test(body)) {
            throw new Error("Aitoda：Google 要求验证。请用浏览器检查原站，稍后再试；本次不会继续重试。")
        }
        if (response.status === 429) throw new Error("Aitoda：原站限制请求频率（HTTP 429）。请稍后再试，不要连续刷新。")
        if (response.status < 200 || response.status >= 300) {
            throw new Error("Aitoda HTTP " + response.status + "：" + url)
        }
        return body
    }

    imageUrl(raw, base = this.site + "/") {
        let value = String(raw ?? "").trim().replace(/&amp;/g, "&")
        if (!value || /^(data:|blob:|javascript:|file:)/i.test(value) || /_files\//i.test(value)) return ""
        if (value.startsWith("//")) value = "https:" + value
        else if (value.startsWith("/")) value = this.site + value
        else if (!/^https?:\/\//i.test(value)) value = base.replace(/\/[^/]*$/, "/") + value
        // Older Blogger posts still contain HTTP image links. Google serves HTTPS.
        value = value.replace(/^http:\/\/(blogger\.googleusercontent\.com|[1-4]\.bp\.blogspot\.com)\//i, "https://$1/")
        // A link to another article or to YouTube is not a page image.
        if (!/^https?:\/\//i.test(value)) return ""
        return /\.(?:jpe?g|png|webp|gif|avif)(?:[?#]|$)/i.test(value) ||
            /^https?:\/\/(?:blogger\.googleusercontent\.com|[1-4]\.bp\.blogspot\.com)\//i.test(value) ? value : ""
    }

    sizedImage(url, size) {
        if (!/^https?:\/\/(?:blogger\.googleusercontent\.com|[1-4]\.bp\.blogspot\.com)\//i.test(url)) return url
        return url.replace(/\/(?:s|w|h)\d+(?:-[a-zA-Z0-9]+)*\//, "/s" + size + "/")
    }

    parseArticle(doc, id, meta = {}) {
        const expectedBody = meta.postNumber ? doc.getElementById("post-body-" + meta.postNumber) : null
        const bodies = doc.querySelectorAll(".post-body.entry-content, .entry-content[itemprop='articleBody']")
        const body = expectedBody || (bodies.length === 1 ? bodies[0] : null)
        if (!body) throw new Error("Aitoda：未找到唯一的文章正文，请确认原站文章可打开。")
        const images = []
        const seen = {}
        for (const img of body.querySelectorAll("img")) {
            const attrs = img.attributes
            if (Number(attrs.width) > 0 && Number(attrs.width) <= 2 && Number(attrs.height) > 0 && Number(attrs.height) <= 2) continue
            let parent = img.parent
            let anchor = ""
            for (let depth = 0; parent && depth < 5; depth++, parent = parent.parent) {
                if (parent.localName === "a") { anchor = this.imageUrl(parent.attributes.href, id); break }
                if (parent.id === body.id) break
            }
            const srcset = String(attrs.srcset ?? "").split(",").map(part => part.trim().split(/\s+/)[0]).filter(Boolean)
            const original = anchor || this.imageUrl(attrs["data-src"], id) ||
                this.imageUrl(srcset[srcset.length - 1], id) || this.imageUrl(attrs.src, id)
            if (!original) continue
            const identity = this.sizedImage(original, 0).split("#")[0]
            if (seen[identity]) continue
            seen[identity] = true
            // Keep the real source URL as image key so fallback survives app restarts.
            images.push(original)
        }
        if (!images.length) throw new Error("Aitoda：正文没有可读取的图片，可能是纯文字文章或网站结构已改变。")
        const labels = (meta.labels || doc.querySelectorAll(".post-labels a").map(a => {
            const path = String(a.attributes.href ?? "").split("/search/label/")[1]
            if (path) { try { return decodeURIComponent(path.split(/[?#]/)[0]) } catch (_) {} }
            return this.cleanText(a.text)
        })).filter(Boolean)
        const published = meta.published || doc.querySelector("abbr.published")?.attributes.title || ""
        const updated = meta.updated || published
        const title = meta.title || this.cleanText(doc.querySelector(".post-title, .entry-title")?.text)
        return {
            title: title || "Aitoda article",
            cover: this.sizedImage(meta.cover || images[0], 480),
            tags: { "标签": labels },
            chapters: null,
            description: meta.summary || this.cleanText(doc.querySelector("meta[name='description']")?.attributes.content || body.text).slice(0, 1500) ||
                "本文图片来自 Aitoda 博客；完整感想请通过原文链接查看。",
            uploadTime: published.slice(0, 10),
            updateTime: updated.slice(0, 10),
            url: id,
            images
        }
    }

    async getDetail(rawId) {
        const id = this.canonicalId(rawId)
        if (!id) throw new Error("Aitoda：无效的文章地址。")
        const cached = this.details[id]
        if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.value
        if (this.pendingDetails[id]) return await this.pendingDetails[id]
        const task = (async () => {
            const html = await this.request(id)
            const doc = new HtmlDocument(html)
            try {
                const value = this.parseArticle(doc, id, this.metadata[id] || {})
                this.details[id] = { at: Date.now(), value }
                const keys = Object.keys(this.details)
                if (keys.length > 24) delete this.details[keys[0]]
                return value
            } finally { doc.dispose() }
        })()
        this.pendingDetails[id] = task
        try { return await task }
        finally { delete this.pendingDetails[id] }
    }

    comic = {
        loadInfo: async id => {
            const detail = await this.getDetail(id)
            const { images, ...info } = detail
            return info
        },
        loadEp: async (id, epId) => ({ images: (await this.getDetail(id)).images }),
        onThumbnailLoad: url => ({ url, headers: this.headers("image/*,*/*;q=0.8") }),
        onImageLoad: (imageKey, comicId, epId) => {
            const original = this.imageUrl(imageKey)
            if (!original) throw new Error("Aitoda：无效的图片地址。")
            const large = this.sizedImage(original, 0)
            const config = { url: large, headers: this.headers("image/*,*/*;q=0.8") }
            if (large !== original) {
                config.onLoadFailed = () => ({ url: original, headers: this.headers("image/*,*/*;q=0.8") })
            }
            return config
        },
        onClickTag: (namespace, tag) => this.tagTarget(tag),
        link: { domains: ["aitoda.blogspot.com"], linkToId: url => this.canonicalId(url) }
    }

    tagTarget(tag) {
        return { page: "category", attributes: { category: tag, param: tag } }
    }

    init() {
        // No network in init: source installation must not depend on Google access.
        const saved = this.loadData("labels")
        this.labels = Array.isArray(saved) ? saved.filter(v => typeof v === "string") : []
    }

    rememberLabels(categories) {
        if (!Array.isArray(categories) || !categories.length) return false
        const seen = Object.create(null)
        const labels = []
        for (const category of categories) {
            const label = String(category?.term ?? "").trim()
            if (!label || seen[label]) continue
            seen[label] = true
            labels.push(label)
        }
        if (!labels.length) return false
        labels.sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0)
        if(this.labels.length===labels.length && this.labels.every((v,i)=>v===labels[i]))return true
        this.labels = labels
        this.directoryMemo = null
        this.saveData("labels", labels)
        return true
    }

    feedUrl(page = 1, label = "", query = "", count = this.pageSize) {
        const n = Math.max(1, Math.floor(Number(page) || 1))
        const path = this.site + "/feeds/posts/default" + (label ? "/-/" + encodeURIComponent(label) : "")
        return path + "?alt=json&orderby=published&max-results=" + count +
            "&start-index=" + ((n - 1) * count + 1) + (query ? "&q=" + encodeURIComponent(query) : "")
    }

    async readFeed(url, rememberLabels = false) {
        const body = await this.request(url, "application/json")
        let data
        try { data = JSON.parse(body) }
        catch (_) { throw new Error("Aitoda：文章接口未返回 JSON，请检查网络或原站。") }
        this.validateFeed(data?.feed)
        if (rememberLabels) this.rememberLabels(data.feed.category)
        return data.feed
    }

    validateFeed(feed) {
        const total=feed?.["openSearch$totalResults"]?.$t
        if(!feed || typeof feed!=="object" || Array.isArray(feed) ||
            (feed.entry!=null&&!Array.isArray(feed.entry)) ||
            (feed.category!=null&&!Array.isArray(feed.category)) ||
            (feed.entry==null&&total==null) ||
            (total!=null&&(!/^\d+$/.test(String(total))||!Number.isSafeInteger(Number(total)))))
            throw new Error("Aitoda：文章列表或分页字段异常；不会当成没有结果。")
    }

    async refreshLabels() {
        if(this.labelsPending)return await this.labelsPending
        this.labelsPending=(async()=>{
            const feed=await this.readFeed(this.feedUrl(1,"","",1))
            if(!this.rememberLabels(feed.category))throw new Error("Aitoda：没有取得有效标签目录，旧缓存已保留。")
        })()
        try{return await this.labelsPending}finally{this.labelsPending=null}
    }

    parseEntry(entry) {
        if(!entry || typeof entry!=="object")return null
        const alternate = (entry.link || []).find(link => link.rel === "alternate" && link.type === "text/html")
        const id = this.canonicalId(alternate?.href)
        if (!id) return null
        const title = this.cleanText(entry.title?.$t)
        const summary = this.plainText(entry.summary?.$t || entry.content?.$t || "").slice(0, 1500)
        const labels = (entry.category || []).map(c => String(c.term ?? "").trim()).filter(Boolean)
        let cover = this.imageUrl(entry["media$thumbnail"]?.url)
        if (!cover && entry.content?.$t) {
            const doc = new HtmlDocument(entry.content.$t)
            try { cover = this.imageUrl(doc.querySelector("img")?.attributes.src, id) }
            finally { doc.dispose() }
        }
        const postNumber = /\.post-(\d+)$/.exec(String(entry.id?.$t ?? ""))?.[1] || ""
        this.metadata[id] = {
            title, summary, labels, cover, postNumber,
            published: String(entry.published?.$t ?? ""), updated: String(entry.updated?.$t ?? "")
        }
        return { id, title, cover: this.sizedImage(cover, 480), subtitle: String(entry.published?.$t ?? "").slice(0, 10), tags: labels, description: summary }
    }

    async loadList(page, label = "", query = "") {
        const url=this.feedUrl(page,label,query)
        if(this.listPending[url])return await this.listPending[url]
        this.listPending[url]=this.fetchList(page,label,query)
        try{return await this.listPending[url]}finally{delete this.listPending[url]}
    }

    async fetchList(page, label = "", query = "") {
        const n = Math.max(1, Math.floor(Number(page) || 1))
        const feed = await this.readFeed(this.feedUrl(n, label, query))
        const entries = Array.isArray(feed.entry) ? feed.entry : []
        const seen = {}
        const comics = []
        for (const entry of entries) {
            const comic = this.parseEntry(entry)
            if (!comic || seen[comic.id]) continue
            seen[comic.id] = true
            comics.push(comic)
        }
        if(entries.length&&!comics.length)throw new Error("Aitoda：返回文章无法识别，可能是接口结构变化。")
        if(!label&&!query)this.rememberLabels(feed.category)
        const keys = Object.keys(this.metadata)
        for (let i = 0; i < keys.length - 240; i++) delete this.metadata[keys[i]]
        const rawTotal=feed["openSearch$totalResults"]?.$t
        const total = rawTotal==null?null:Number(rawTotal)
        // Blogger's q search reports current-page counts, not a global total.
        const maxPage = query || total===null ? (entries.length === this.pageSize ? n + 1 : n) : Math.max(1, Math.ceil(total / this.pageSize))
        return { comics, maxPage }
    }

    explore = [{
        title: "Aitoda 最新文章",
        type: "multiPageComicList",
        load: async page => this.loadList(page)
    }]

    search = {
        optionList: [],
        load: async (keyword, options, page) => this.loadList(page, "", this.cleanText(keyword))
    }

    category = {
        title: "Aitoda 分类",
        enableRankingPage: false,
        parts: [{
            name: "常用分类",
            type: "fixed",
            categories: [
                ["写真集扫描", "Photobook scans"],
                ["数字写真", "Digital photobooks"],
                ["写真模特", "Gravure models"],
                ["日剧感想", "Japanese drama reviews"],
                ["日本电影感想", "Japanese movie reviews"],
                ["乃木坂46", "Nogizaka46"],
                ["日向坂46", "Hinatazaka46"],
                ["樱坂46", "Sakurazaka46"]
            ].map(([label, tag]) => ({ label, target: this.tagTarget(tag) }))
        }, {
            name: "缓存标签（每批最多 30 项；源设置可搜索／翻批）",
            type: "dynamic",
            loader: () => this.directoryWindow()
                .map(label => ({ label, target: this.tagTarget(label) }))
        }]
    }

    categoryComics = {
        optionList: [],
        load: async (category, param, options, page) => this.loadList(page, param || category)
    }

    settings = {
        refreshLabels: {
            title: "刷新全部标签（首次使用请点击）",
            type: "callback",
            buttonText: "刷新标签",
            callback: async () => {
                await this.refreshLabels()
                UI.showMessage("已保存 " + this.labels.length + " 个标签。请重新打开分类页。")
            }
        },
        accessNote: {
            title: "网络与验证说明",
            type: "callback",
            buttonText: "查看说明",
            callback: () => UI.showMessage("博客、文章接口和 Google 图片域名都必须能访问。浏览器能打开不保证应用使用同一网络。遇到 Google 验证请稍后重试，不要连续刷新。")
        }
    }
}
