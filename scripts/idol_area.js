// Standalone VeneraNext source. No browser/GM globals or external imports.
class PhotoDeckIdolAreaSource extends ComicSource {
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
    url = "https://raw.githubusercontent.com/tide23333-max/venera-photo-sources/main/scripts/idol_area.js"
    labels = []
    details = {}
    pending = {}
    listPending = {}
    labelsPending = null
    clean(v) { return String(v ?? "").replace(/\s+/g, " ").trim() }
    headers(image = false) { return { "User-Agent": "Mozilla/5.0", "Referer": this.site + "/", "Accept": image ? "image/*,*/*;q=0.8" : "*/*" } }
    async request(url, json = false) {
        const r = await Network.get(url, this.headers())
        const body = String(r.body ?? "")
        if (/unusual traffic|automated queries|captcha-form|\/sorry\/index/i.test(body)) throw new Error(this.name + "：Google 要求验证，请在浏览器检查原站；不会自动重试。")
        if (r.status === 429) throw new Error(this.name + "：请求过于频繁，请稍后重试。")
        if (r.status < 200 || r.status >= 300) throw new Error(this.name + " HTTP " + r.status)
        if (!json) return body
        try { return JSON.parse(body) } catch (_) { throw new Error(this.name + "：接口未返回 JSON，请检查网络或原站。") }
    }
    imageUrl(v) {
        let u = String(v ?? "").trim().replace(/&amp;/g, "&")
        if (u.startsWith("//")) u = "https:" + u
        if (u.startsWith("/")) u = this.site + u
        return /^https?:\/\//i.test(u) && !/_files\//i.test(u) ? u.replace(/^http:\/\/((?:[1-4]\.bp\.blogspot\.com|blogger\.googleusercontent\.com)\/)/i, "https://$1") : ""
    }
    plain(html) {
        const doc = new HtmlDocument("<div>" + String(html ?? "") + "</div>")
        try { return this.clean(doc.querySelector("div")?.text) } finally { doc.dispose() }
    }
    init() { const saved = this.loadData("labels"); this.labels = Array.isArray(saved) ? saved : [] }
    saveLabels(labels) {
        const values=[...new Set(labels.filter(v=>typeof v==="string"&&v.trim()).map(v=>v.trim()))].sort()
        if(!values.length)return false
        if(this.labels.length===values.length&&this.labels.every((v,i)=>v===values[i]))return true
        this.labels=values;this.directoryMemo=null;this.saveData("labels",values);return true
    }
    tagTarget(label, id = label) { return { page: "category", attributes: { category: label, param: String(id) } } }
    groupedParts() {
        return [{name:"缓存标签（每批最多 30 项；源设置可搜索／翻批）",type:"dynamic",
            loader:()=>this.directoryWindow().map(x=>({label:x.name||x,target:this.tagTarget(x.name||x,x.id||x)}))}]
    }
    async getDetail(id) {
        id = this.validId(id)
        if (!id) throw new Error(this.name + "：无效的作品 ID。")
        const cache = this.details[id]
        if (cache && Date.now() - cache.at < 600000) return cache.value
        if (this.pending[id]) return await this.pending[id]
        this.pending[id] = (async () => {
            const value = await this.fetchDetail(id)
            this.details[id] = { at: Date.now(), value }
            const keys = Object.keys(this.details); if (keys.length > 24) delete this.details[keys[0]]
            return value
        })()
        try { return await this.pending[id] } finally { delete this.pending[id] }
    }
    comic = {
        loadInfo: async id => { const { images, ...info } = await this.getDetail(id); return info },
        loadEp: async (id, epId) => ({ images: (await this.getDetail(id)).images }),
        onThumbnailLoad: url => ({ url, headers: this.headers(true) }),
        onImageLoad: (url, id, epId) => this.imageConfig(url, id),
        onClickTag: (namespace, label) => this.tagTarget(label)
    }
    settings = {
        refreshLabels: {
            title: "刷新全部标签（首次使用请点击）", type: "callback", buttonText: "刷新标签",
            callback: async () => { await this.refreshLabels(); UI.showMessage("已缓存 " + this.labels.length + " 个标签，请重新打开分类页。") }
        },
        accessNote: {
            title: "网络说明", type: "callback", buttonText: "查看说明",
            callback: () => UI.showMessage("原站、接口及图片域名均需可访问；封面与正文使用独立请求。遇到验证或限流不会自动重试。")
        }
    }

    name = "IDOL AREA"
    key = "photo_deck_idol_area"
    site = "https://idolarea.blogspot.com"
    validId(id) { return /^\d+$/.test(String(id)) ? String(id) : null }
    sized(url, size) {
        return /^https?:\/\/(?:blogger\.googleusercontent\.com|[1-4]\.bp\.blogspot\.com)\//i.test(url) ? url.replace(/\/(?:s|w|h)\d+(?:-[a-zA-Z0-9]+)*\//, "/s" + size + "/") : url
    }
    parseImages(html, firstOnly = false) {
        const doc = new HtmlDocument(html); const images = [], seen = {}
        try {
            for (const img of doc.querySelectorAll("img")) {
                const a = img.attributes
                if (Number(a.width) > 0 && Number(a.width) <= 2 && Number(a.height) > 0 && Number(a.height) <= 2) continue
                let parent = img.parent, link = ""
                for (let n = 0; parent && n < 6; n++, parent = parent.parent) {
                    if (parent.localName === "a") { link = this.imageUrl(parent.attributes.href); break }
                }
                const usable = u => /\.(?:jpe?g|png|webp|gif|avif)(?:[?#]|$)/i.test(u) || /^https?:\/\/(?:blogger\.googleusercontent\.com|[1-4]\.bp\.blogspot\.com)\//i.test(u)
                let u = usable(link) ? link : this.imageUrl(a["data-src"] || a.src)
                if (!u || !usable(u)) continue
                const identity = this.sized(u, 0)
                if (!seen[identity]) { seen[identity] = true; images.push(u); if(firstOnly)break }
            }
        } finally { doc.dispose() }
        return images
    }
    meta(entry, includeImages = true) {
        if(!entry||typeof entry!=="object")return null
        const id = /\.post-(\d+)$/.exec(String(entry.id?.$t ?? ""))?.[1]
        if (!id) return null
        const html = entry.content?.$t || ""
        const images = includeImages ? this.parseImages(html) : []
        const thumbnail=this.imageUrl(entry["media$thumbnail"]?.url)
        const cover = thumbnail || (includeImages?images[0]:this.parseImages(html,true)[0]) || ""
        return { id, title: this.clean(entry.title?.$t), cover: this.sized(cover, 480),
            tags: (entry.category || []).map(x => x.term).filter(Boolean),
            subtitle: String(entry.published?.$t || "").slice(0,10), description: this.plain(entry.summary?.$t || html).slice(0,1500),
            original: (entry.link || []).find(x => x.rel === "alternate" && x.type === "text/html")?.href || "",
            images, published: entry.published?.$t || "", updated: entry.updated?.$t || "" }
    }
    feedUrl(page, tag = "", word = "", count = 20) {
        return this.site + "/feeds/posts/default" + (tag ? "/-/" + encodeURIComponent(tag) : "") +
            "?alt=json&orderby=published&max-results=" + count + "&start-index=" + ((Math.max(1, Math.floor(Number(page) || 1))-1)*count+1) + (word ? "&q=" + encodeURIComponent(word) : "")
    }
    validateFeed(feed) {
        const total=feed?.["openSearch$totalResults"]?.$t
        if(!feed||typeof feed!=="object"||Array.isArray(feed)||
            (feed.entry!=null&&!Array.isArray(feed.entry))||
            (feed.category!=null&&!Array.isArray(feed.category))||
            (feed.entry==null&&total==null)||
            (total!=null&&(!/^\d+$/.test(String(total))||!Number.isSafeInteger(Number(total)))))
            throw new Error(this.name+"：文章列表或分页字段异常；不会当成没有结果。")
    }
    async loadList(page, tag = "", word = "") {
        const url=this.feedUrl(page,tag,word)
        if(this.listPending[url])return await this.listPending[url]
        this.listPending[url]=this.fetchList(page,tag,word)
        try{return await this.listPending[url]}finally{delete this.listPending[url]}
    }
    async fetchList(page, tag = "", word = "") {
        const data = await this.request(this.feedUrl(page, tag, word), true)
        this.validateFeed(data?.feed)
        const entries = data.feed.entry || []
        const seen = {}; const comics = []
        for (const entry of entries) {
            const m = this.meta(entry,false)
            if (!m || seen[m.id]) continue
            seen[m.id] = true
            comics.push({ id: m.id, title: m.title, cover: m.cover, tags: m.tags, subtitle: m.subtitle, description: m.description })
        }
        if(entries.length&&!comics.length)throw new Error(this.name+"：返回文章无法识别，可能是接口结构变化。")
        if(!tag&&!word&&data.feed.category)this.saveLabels(data.feed.category.map(x=>x?.term))
        const n = Math.max(1, Math.floor(Number(page) || 1)), rawTotal=data.feed["openSearch$totalResults"]?.$t
        const total=rawTotal==null?null:Number(rawTotal)
        return { comics, maxPage: word || total===null ? (entries.length === 20 ? n+1 : n) : Math.max(1, Math.ceil(total/20)) }
    }
    async fetchDetail(id) {
        const data = await this.request(this.site + "/feeds/posts/default/" + id + "?alt=json", true)
        const m = data?.entry && this.meta(data.entry)
        if (!m || m.id !== id) throw new Error(this.name + "：文章接口结构异常。")
        if (!data.entry.content?.$t && m.original) {
            const doc = new HtmlDocument(await this.request(m.original))
            try {
                const body = doc.getElementById("post-body-" + id) || doc.querySelector(".post-body.entry-content")
                if (body) m.images = this.parseImages(body.innerHTML)
            } finally { doc.dispose() }
        }
        if (!m.images.length) throw new Error(this.name + "：正文没有可读取的图片，可能是纯文字文章或正文缺失。")
        return { title: m.title, cover: m.cover || this.sized(m.images[0],480), tags: { "标签": m.tags }, chapters: null,
            description: m.description, uploadTime: m.published.slice(0,10), updateTime: m.updated.slice(0,10), url: m.original, images: m.images }
    }
    imageConfig(original) {
        const config = { url: this.sized(original,0), headers: this.headers(true) }
        if (config.url !== original) config.onLoadFailed = () => ({ url: original, headers: this.headers(true) })
        return config
    }
    async refreshLabels() {
        if(this.labelsPending)return await this.labelsPending
        this.labelsPending=(async()=>{
            const data = await this.request(this.feedUrl(1,"","",1),true)
            this.validateFeed(data?.feed)
            if (!Array.isArray(data.feed.category)||!this.saveLabels(data.feed.category.map(x=>x?.term))) throw new Error(this.name + "：没有取得有效标签目录，旧缓存已保留。")
        })()
        try{return await this.labelsPending}finally{this.labelsPending=null}
    }
    explore = [{ title: "IDOL AREA 最新", type: "multiPageComicList", load: async page => this.loadList(page) }]
    search = { optionList: [], load: async (word, options, page) => this.loadList(page,"",this.clean(word)) }
    categoryComics = { optionList: [], load: async (category, param, options, page) => this.loadList(page,param || category) }
    category = {
        title: "IDOL AREA 分类", enableRankingPage: false,
        parts: [{ name: "常用分类", type: "fixed", categories: [
            ["写真集","Photobook"],["Young Magazine","Young Magazine"],["Young Jump","Young Jump"],["Weekly Playboy","Weekly Playboy"],["FLASH","FLASH"]
        ].map(([label,id])=>({label,target:this.tagTarget(id)})) }, ...this.groupedParts()]
    }
}

