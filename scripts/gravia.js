// Standalone VeneraNext source. No browser/GM globals or external imports.
class PhotoDeckGraviaSource extends ComicSource {
    version = "0.1.4"
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
    url = "https://raw.githubusercontent.com/tide23333-max/venera-photo-sources/main/scripts/gravia.js"
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
    saveLabels(labels) { this.labels = labels; this.directoryMemo = null; this.saveData("labels", labels) }
    tagTarget(label, id = label) { return { page: "category", attributes: { category: label, param: String(id) } } }
    async getDetail(id) {
        id = this.validId(id)
        if (!id) throw new Error(this.name + "：无效的作品 ID。")
        const cache = this.details[id]
        // An inconsistent count may be transient while the site imports images.
        // Retry only on a later detail visit, not in an automatic request loop.
        if (cache && Date.now() - cache.at < (cache.value._countUncertain ? 30000 : 600000)) return cache.value
        if (this.pending[id]) return await this.pending[id]
        this.pending[id] = (async () => {
            const value = await this.fetchDetail(id)
            this.details[id] = { at: Date.now(), value }
            const keys = Object.keys(this.details); if (keys.length > 24) delete this.details[keys[0]]
            return value
        })()
        try { return await this.pending[id] } finally { delete this.pending[id] }
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

    name="Gravia"
    key="photo_deck_gravia"
    site="https://gravia.site"
    api="https://gra-worker.uuu3.workers.dev"
    fallback={}
    labelsPending=null
    tagLabel(tag){return this.clean(tag.name)+"（ID:"+tag.id+"）"}
    tagClick(label){
        const encoded=/（ID:(\d+)）$/.exec(String(label))
        if(encoded)return this.tagTarget(label,encoded[1])
        const ids={}
        for(const t of this.labels)if(t.name===label&&this.validId(t.id))ids[String(t.id)]=true
        for(const detail of Object.values(this.details))for(const t of detail.value._tags||[])if(t.name===label)ids[t.id]=true
        const matches=Object.keys(ids)
        if(matches.length===1)return this.tagTarget(label,matches[0])
        UI.showMessage(matches.length?"该名称对应多个标签，请选择带 ID 的标签或从分类目录进入。":"该标签没有可靠 ID，请刷新标签目录后重试。")
        return null
    }
    directoryTagLabel(tag){
        return this.labels.some(t=>t.name===tag.name&&String(t.id)!==String(tag.id))?this.tagLabel(tag):tag.name
    }
    validId(id){return /^\d+$/.test(String(id))?String(id):null}
    boxComic(box){
        if(box.id==null||!box.title)throw new Error(this.name+"：列表字段缺失。")
        return {id:String(box.id),title:this.clean(box.title),cover:this.imageUrl(box.topImage?.thumUrl||box.topImage?.midUrl||box.topImage?.url),
            subtitle:String(box.imageCount||0)+" 张 · "+String(box.createdAt||"").slice(0,10)}
    }
    async loadList(page,tag="",word=""){
        let path="/api/boxes?page="+Math.max(1,Number(page)||1)
        if(tag) {
            if(!this.validId(tag))throw new Error(this.name+"：标签 ID 不可用，请先刷新标签目录。")
            path+="&tag_id="+encodeURIComponent(tag)
        }
        if(word)path+="&word="+encodeURIComponent(word)
        const d=await this.request(this.api+path,true)
        if(!d||!Array.isArray(d.boxes)||!Number.isInteger(d.totalPages)||d.totalPages<0)throw new Error(this.name+"：列表接口结构已改变。")
        const seen={};const comics=[]
        for(const box of d.boxes){const item=this.boxComic(box);if(!seen[item.id]){seen[item.id]=true;comics.push(item)}}
        return {comics,maxPage:Math.max(1,d.totalPages)}
    }
    async fetchDetail(id){
        const d=await this.request(this.api+"/api/boxes/"+id,true)
        if(!d||String(d.id)!==id||!Array.isArray(d.images)||(d.tags!=null&&!Array.isArray(d.tags)))throw new Error(this.name+"：图集接口结构已改变。")
        const images=[],seen={},fallback={}
        for(const img of d.images){
            if(!img||typeof img!=="object")throw new Error(this.name+"：正文图片字段异常。")
            const u=this.imageUrl(img.url),mid=this.imageUrl(img.midUrl)
            if(!u)throw new Error(this.name+"：正文图片地址缺失。")
            if(!seen[u]){seen[u]=true;images.push(u)}
            if(mid&&mid!==u)fallback[u]=mid
        }
        if(!images.length)throw new Error(this.name+"：图集没有图片。")
        const number=Number(d.imageCount)
        const declared=d.imageCount!=null&&String(d.imageCount).trim()!==""&&Number.isInteger(number)&&number>=0?number:null
        const uncertain=declared===null||declared!==images.length||d.images.length!==images.length
        let countNote="已取得 "+images.length+" 张图片"
        if(uncertain){
            countNote+="\n数量提示："+(declared===null?"接口没有有效的声明数量":"接口标注 "+declared+" 张，当前返回 "+d.images.length+" 条图片记录")
            if(d.images.length!==images.length)countNote+="，去重后 "+images.length+" 张"
            countNote+="。当前完整性尚未确认，仅提供已取得的图片；请稍后重新打开详情核对，不会猜测或补造图片地址。"
        }
        const tags=(d.tags||[]).filter(t=>t&&this.validId(t.id)&&this.clean(t.name))
            .map(t=>({id:String(t.id),name:this.clean(t.name),category:t.category||""}))
        // Independent bounded fallback cache also supports a recently evicted book.
        for(const u of Object.keys(fallback)){
            const key=id+"@"+u
            delete this.fallback[key]
            this.fallback[key]=fallback[u]
        }
        const keys=Object.keys(this.fallback)
        for(let i=0;i<keys.length-4096;i++)delete this.fallback[keys[i]]
        return {title:this.clean(d.title),cover:this.imageUrl(d.images[0].thumUrl||d.images[0].midUrl||d.images[0].url),
            tags:{"标签":tags.map(t=>this.tagLabel(t))},chapters:null,uploadTime:String(d.createdAt||"").slice(0,10),
            updateTime:String(d.updatedAt||"").slice(0,10),url:this.site+"/box/"+id,
            description:countNote+(d.sourceUrl?"\n原始来源："+d.sourceUrl:""),
            _countUncertain:uncertain,_imageCountStatus:{declared,returned:d.images.length,actual:images.length},_tags:tags,_fallback:fallback,images}
    }
    async imageConfig(url,id){
        // Restored downloads may invoke the image callback before opening details.
        const key=this.validId(id)
        let detail=key?this.details[key]?.value:null
        if(key&&!detail&&!this.fallback[key+"@"+url])detail=await this.getDetail(key)
        const config={url,headers:this.headers(true)},mid=detail?._fallback?.[url]||this.fallback[key+"@"+url]
        if(mid&&mid!==url)config.onLoadFailed=()=>({url:mid,headers:this.headers(true)})
        return config
    }
    init(){const saved=this.loadData("labels");this.labels=Array.isArray(saved)?saved:[];this.directoryMemo=null}
    async refreshLabels(){
        if(this.labelsPending)return await this.labelsPending
        this.labelsPending=this.fetchLabels()
        try{return await this.labelsPending}finally{this.labelsPending=null}
    }
    async fetchLabels(){
        const cats=await this.request(this.api+"/api/tags/categories",true)
        const popular=await this.request(this.api+"/api/tags/popular?limit=30",true)
        if(!cats||!popular||!Array.isArray(cats.categories)||!cats.categories.length||!Array.isArray(popular.tags))throw new Error(this.name+"：标签接口结构异常。")
        const labels=[],seen={}
        const add=(t,category)=>{
            if(!t||!this.validId(t.id)||!this.clean(t.name))throw new Error(this.name+"：标签名称或 ID 缺失，旧缓存未修改。")
            if(!seen[t.id]){seen[t.id]=true;labels.push({id:String(t.id),name:this.clean(t.name),category:t.category||category})}
        }
        for(const c of cats.categories){
            if(!c||typeof c.value!=="string"||!c.value)throw new Error(this.name+"：标签类别结构异常，旧缓存未修改。")
            for(let page=1;;page++){
                const d=await this.request(this.api+"/api/tags?category="+encodeURIComponent(c.value)+"&page="+page,true)
                if(!d||!Array.isArray(d.tags)||!Number.isInteger(d.totalPages)||d.totalPages<0)throw new Error(this.name+"：标签分页结构异常。")
                for(const t of d.tags)add(t,c.value)
                if(page>=d.totalPages)break
                if(page>=100)throw new Error(this.name+"：标签分页异常，旧缓存未修改。")
            }
        }
        for(const t of popular.tags)add(t,"popular")
        if(!labels.length)throw new Error(this.name+"：没有取得有效标签，旧缓存未修改。")
        this.saveLabels(labels)
        this.saveData("popular",popular.tags.map(t=>({id:String(t.id),name:t.name})))
    }
    comic={
        loadInfo:async id=>{const{images,_tags,_fallback,...info}=await this.getDetail(id);return info},
        // Keep the opened detail's image order/count during reading. A later detail
        // visit may refresh a short-lived uncertain response, without mid-read shifts.
        loadEp:async(id,epId)=>{
            const key=this.validId(id)
            if(!key)throw new Error(this.name+"：无效的作品 ID。")
            return {images:(this.details[key]?.value||await this.getDetail(key)).images}
        },
        onThumbnailLoad:url=>({url,headers:this.headers(true)}),
        onImageLoad:(url,id,epId)=>this.imageConfig(url,id),
        onClickTag:(namespace,label)=>this.tagClick(label),
        link:{domains:["gravia.site","www.gravia.site"],linkToId:url=>/https?:\/\/(?:www\.)?gravia\.site\/box\/(\d+)(?:[?#]|$)/.exec(url)?.[1]||null}
    }
    explore=[{title:"Gravia 最新",type:"multiPageComicList",load:async page=>this.loadList(page)}]
    search={optionList:[],load:async(word,options,page)=>this.loadList(page,"",this.clean(word))}
    categoryComics={optionList:[],load:async(category,param,options,page)=>this.loadList(page,param)}
    category={title:"Gravia 分类",enableRankingPage:false,parts:[
        {name:"热门标签（首次请刷新）",type:"dynamic",loader:()=> (this.loadData("popular")||[]).map(t=>({label:this.directoryTagLabel(t),target:this.tagTarget(t.name,t.id)}))},
        ...[["人物","person"],["团体","group"],["杂志／系列","series"],["角色","character"]].map(([name,c])=>({
            name:"缓存"+name+"（共用每批 60 项）",type:"dynamic",loader:()=>this.directoryWindow().filter(t=>t.category===c).map(t=>({label:this.directoryTagLabel(t),target:this.tagTarget(t.name,t.id)}))
        }))
    ]}
}

