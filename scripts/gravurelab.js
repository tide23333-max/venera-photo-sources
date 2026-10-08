// Standalone VeneraNext source. No browser/GM globals or external imports.
class PhotoDeckGravureLabSource extends ComicSource {
    version = "0.1.2"
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
        const pages = Math.max(1, Math.ceil(filtered.length / 60)), page = Math.min(requested,pages)
        const result = {items:filtered.slice((page-1)*60,page*60),page,pages,total:entries.length,matched:filtered.length,query}
        this.directoryMemo = {entries,length:entries.length,query,requested,result}
        return result
    }
    directoryWindow() { return this.directoryPageData().items }
    directoryNotice() {
        const d=this.directoryPageData()
        UI.showMessage("缓存 "+d.total+" 项，匹配 "+d.matched+" 项；第 "+d.page+"/"+d.pages+" 批，每批最多 60 项。修改后请重新进入分类页；完整缓存没有删除。")
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
    url = "https://raw.githubusercontent.com/tide23333-max/venera-photo-sources/main/scripts/gravurelab.js"
    labels = []
    details = {}
    pending = {}
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
    saveLabels(labels) { this.labels = labels; this.saveData("labels", labels) }
    tagTarget(label, id = label) { return { page: "category", attributes: { category: label, param: String(id) } } }
    labelGroup(label) { const c = String(label).charAt(0).toUpperCase(); return /^[A-Z]$/.test(c) ? c : /^[0-9]$/.test(c) ? "0–9" : "中文／日文／其他" }
    groupedParts() {
        return [{name:"缓存标签（每批最多 60 项；源设置可搜索／翻批）",type:"dynamic",
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
        onClickTag: (namespace, label) => this.tagTarget(label, this.labels.find(x => x.name === label)?.id || label)
    }
    imageConfig(url) { return { url, headers: this.headers(true) } }
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

    name = "GravureLab"
    key = "photo_deck_gravurelab"
    site = "https://gravurelab.com"
    validId(id) { return /^[a-zA-Z0-9_-]+$/.test(String(id)) ? String(id) : null }
    galleryId(url) { return /^(?:https?:\/\/gravurelab\.com)?\/gallery\/([a-zA-Z0-9_-]+)(?:[?#]|$)/.exec(String(url))?.[1] || null }
    parseList(html, path, page) {
        const doc = new HtmlDocument(html), comics = [], seen = {}
        try {
            for (const a of doc.querySelectorAll("a[href]")) {
                const id = this.galleryId(a.attributes.href)
                if (!id || seen[id]) continue
                let card = a.parent
                for (let i=0; card && i<5 && !card.querySelector("h2"); i++) card = card.parent
                if (!card) continue
                const heading = card.querySelector("h2"), img = card.querySelector(".lazy-container img")
                const cover = this.imageUrl(img?.attributes["data-src"] || img?.attributes.src)
                if (!heading || !cover) continue
                seen[id] = true
                comics.push({id,title:this.clean(heading.text),cover,tags:card.querySelectorAll("a[href^='/tags/']").map(t=>this.clean(t.text))})
            }
            // Only follow pagination for this exact route, excluding language links.
            const route = path.split("?")[0]
            const next = doc.querySelectorAll("a[href]").some(a => {
                const href = String(a.attributes.href).replace(/&amp;/g,"&")
                return href.split("?")[0] === route && Number(/[?&]page=(\d+)/.exec(href)?.[1]) === Number(page)+1
            })
            return {comics,maxPage:next ? Number(page)+1 : Number(page)}
        } finally {doc.dispose()}
    }
    async loadList(page, tag="", word="", hot=false) {
        const n=Math.max(1,Number(page)||1)
        const path=tag ? "/tags/"+encodeURIComponent(tag) : word ? "/search?q="+encodeURIComponent(word) : hot ? "/hot" : "/"
        return this.parseList(await this.request(this.site+path+(path.includes("?")?"&":"?")+"page="+n),path,n)
    }
    parseDetail(html,id) {
        const doc=new HtmlDocument(html)
        try {
            let meta=null
            for(const script of doc.querySelectorAll("script[type='application/ld+json']")) {
                try {
                    const raw=JSON.parse(script.text)
                    const entries=Array.isArray(raw)?raw:[raw,...(raw["@graph"]||[])]
                    meta=entries.find(x=>x["@type"]==="ImageGallery") || meta
                }catch(_){}
            }
            const title=this.clean(meta?.name || doc.querySelector("h1")?.text)
            if(!title) throw new Error(this.name+"：未找到图集名称。")
            const matches=doc.querySelectorAll(".lazy-container img").filter(img=>this.clean(img.attributes.alt).startsWith(title))
            // Find the gallery section, not the neighboring recommendation cards.
            let body=matches[0]?.parent
            for(let i=0;body && body.localName!=="section" && i<12;i++) body=body.parent
            if(!body || body.localName!=="section") throw new Error(this.name+"：未找到正文容器。")
            const images=[],seen={}
            for(const img of body.querySelectorAll(".lazy-container img")) {
                if(!this.clean(img.attributes.alt).startsWith(title))continue
                const u=this.imageUrl(img.attributes["data-src"] || img.attributes.src)
                if(u&&!seen[u]) {seen[u]=true;images.push(u)}
            }
            if(!images.length)throw new Error(this.name+"：正文没有可读取的图片；不会使用预览图或推荐图片代替。")
            const tags=String(meta?.keywords || "").split(",").map(x=>this.clean(x)).filter(Boolean)
            return {title,cover:images[0],tags:{"标签":tags},chapters:null,description:this.clean(meta?.description),url:this.site+"/gallery/"+id,images}
        }finally{doc.dispose()}
    }
    async fetchDetail(id){return this.parseDetail(await this.request(this.site+"/gallery/"+id),id)}
    async refreshLabels(){
        const labels=[],seen={};let page=1
        while(true){
            const doc=new HtmlDocument(await this.request(this.site+"/tags?page="+page))
            let next=false
            try{
                for(const a of doc.querySelectorAll("a[href^='/tags/']")){
                    let tag;try{tag=decodeURIComponent(a.attributes.href.slice(6).split(/[?#]/)[0])}catch(_){continue}
                    if(tag&&!seen[tag]){seen[tag]=true;labels.push(tag)}
                }
                next=doc.querySelectorAll("a[href]").some(a=>a.attributes.href==="/tags?page="+(page+1))
            }finally{doc.dispose()}
            if(!next)break
            if(++page>500)throw new Error(this.name+"：标签分页异常，已停止，旧缓存未修改。")
        }
        if(!labels.length)throw new Error(this.name+"：没有取得标签。")
        this.saveLabels(labels.sort())
    }
    explore=[
        {title:"GravureLab 日本写真",type:"multiPageComicList",load:async page=>this.loadList(page,"japanese")},
        {title:"GravureLab 全站最新",type:"multiPageComicList",load:async page=>this.loadList(page)},
        {title:"GravureLab 热门",type:"multiPageComicList",load:async page=>this.loadList(page,"","",true)}
    ]
    search={optionList:[],load:async(word,options,page)=>this.loadList(page,"",this.clean(word))}
    categoryComics={optionList:[],load:async(category,param,options,page)=>this.loadList(page,param||category)}
    category={title:"GravureLab 分类",enableRankingPage:false,parts:[
        {name:"地区",type:"fixed",categories:[["日本","japanese"],["中国","chinese"],["韩国","korean"]].map(([label,id])=>({label,target:this.tagTarget(id)}))},...this.groupedParts()
    ]}
}

