// Standalone VeneraNext source. No browser/GM globals or external imports.
class PhotoDeckGraviaSource extends ComicSource {
    version = "0.1.1"
    minAppVersion = "1.17.0"
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
    init() { const saved = this.loadData("labels"); this.labels = Array.isArray(saved) ? saved : [] }
    saveLabels(labels) { this.labels = labels; this.saveData("labels", labels) }
    tagTarget(label, id = label) { return { page: "category", attributes: { category: label, param: String(id) } } }
    labelGroup(label) { const c = String(label).charAt(0).toUpperCase(); return /^[A-Z]$/.test(c) ? c : /^[0-9]$/.test(c) ? "0–9" : "中文／日文／其他" }
    groupedParts() {
        return [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "0–9", "中文／日文／其他"].map(group => ({
            name: "全部标签 · " + group, type: "dynamic",
            loader: () => this.labels.filter(x => this.labelGroup(x.name || x) === group).map(x => ({ label: x.name || x, target: this.tagTarget(x.name || x, x.id || x) }))
        }))
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

    name="Gravia"
    key="photo_deck_gravia"
    site="https://gravia.site"
    api="https://gra-worker.uuu3.workers.dev"
    fallback={}
    tagIds={}
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
        if(!Array.isArray(d.boxes)||!Number.isFinite(d.totalPages))throw new Error(this.name+"：列表接口结构已改变。")
        const seen={};const comics=[]
        for(const box of d.boxes){const item=this.boxComic(box);if(!seen[item.id]){seen[item.id]=true;comics.push(item)}}
        return {comics,maxPage:Math.max(1,d.totalPages)}
    }
    async fetchDetail(id){
        const d=await this.request(this.api+"/api/boxes/"+id,true)
        if(String(d.id)!==id||!Array.isArray(d.images))throw new Error(this.name+"：图集接口结构已改变。")
        const images=[],seen={}
        for(const img of d.images){
            const u=this.imageUrl(img.url),mid=this.imageUrl(img.midUrl)
            if(!u)throw new Error(this.name+"：正文图片地址缺失。")
            if(!seen[u]){seen[u]=true;images.push(u)}
            if(mid&&mid!==u)this.fallback[u]=mid
        }
        if(!images.length)throw new Error(this.name+"：图集没有图片。")
        if(Number(d.imageCount)!==d.images.length)throw new Error(this.name+"：图片数量与接口声明不一致，请稍后重试。")
        for(const t of d.tags||[])this.tagIds[t.name]=String(t.id)
        return {title:this.clean(d.title),cover:this.imageUrl(d.images[0].thumUrl||d.images[0].midUrl||d.images[0].url),
            tags:{"标签":(d.tags||[]).map(x=>x.name)},chapters:null,uploadTime:String(d.createdAt||"").slice(0,10),
            updateTime:String(d.updatedAt||"").slice(0,10),url:this.site+"/box/"+id,
            description:d.imageCount+" 张图片"+(d.sourceUrl?"\n原始来源："+d.sourceUrl:""),images}
    }
    async imageConfig(url,id){
        // Restored downloads may invoke the image callback before opening details.
        if(!this.fallback[url]&&id)await this.getDetail(id)
        const config={url,headers:this.headers(true)},mid=this.fallback[url]
        if(mid&&mid!==url)config.onLoadFailed=()=>({url:mid,headers:this.headers(true)})
        return config
    }
    init(){const saved=this.loadData("labels");this.labels=Array.isArray(saved)?saved:[];for(const t of this.labels)this.tagIds[t.name]=String(t.id)}
    async refreshLabels(){
        const cats=await this.request(this.api+"/api/tags/categories",true)
        const popular=await this.request(this.api+"/api/tags/popular?limit=30",true)
        if(!Array.isArray(cats.categories)||!Array.isArray(popular.tags))throw new Error(this.name+"：标签接口结构异常。")
        const labels=[],seen={}
        for(const c of cats.categories){
            for(let page=1;;page++){
                const d=await this.request(this.api+"/api/tags?category="+encodeURIComponent(c.value)+"&page="+page,true)
                if(!Array.isArray(d.tags)||!Number.isFinite(d.totalPages))throw new Error(this.name+"：标签分页结构异常。")
                for(const t of d.tags)if(!seen[t.id]){seen[t.id]=true;labels.push({id:String(t.id),name:t.name,category:t.category||c.value})}
                if(page>=d.totalPages)break
                if(page>=100)throw new Error(this.name+"：标签分页异常，旧缓存未修改。")
            }
        }
        for(const t of popular.tags)if(!seen[t.id])labels.push({id:String(t.id),name:t.name,category:"popular"})
        this.saveLabels(labels)
        this.saveData("popular",popular.tags.map(t=>({id:String(t.id),name:t.name})))
        for(const t of labels)this.tagIds[t.name]=t.id
    }
    comic={
        loadInfo:async id=>{const{images,...info}=await this.getDetail(id);return info},
        loadEp:async(id,epId)=>({images:(await this.getDetail(id)).images}),
        onThumbnailLoad:url=>({url,headers:this.headers(true)}),
        onImageLoad:(url,id,epId)=>this.imageConfig(url,id),
        onClickTag:(namespace,label)=>this.tagTarget(label,this.tagIds[label]||this.labels.find(t=>t.name===label)?.id||""),
        link:{domains:["gravia.site","www.gravia.site"],linkToId:url=>/https?:\/\/(?:www\.)?gravia\.site\/box\/(\d+)(?:[?#]|$)/.exec(url)?.[1]||null}
    }
    explore=[{title:"Gravia 最新",type:"multiPageComicList",load:async page=>this.loadList(page)}]
    search={optionList:[],load:async(word,options,page)=>this.loadList(page,"",this.clean(word))}
    categoryComics={optionList:[],load:async(category,param,options,page)=>this.loadList(page,param)}
    category={title:"Gravia 分类",enableRankingPage:false,parts:[
        {name:"热门标签（首次请刷新）",type:"dynamic",loader:()=> (this.loadData("popular")||[]).map(t=>({label:t.name,target:this.tagTarget(t.name,t.id)}))},
        ...[["人物","person"],["团体","group"],["杂志／系列","series"],["角色","character"]].map(([name,c])=>({
            name,type:"dynamic",loader:()=>this.labels.filter(t=>t.category===c).map(t=>({label:t.name,target:this.tagTarget(t.name,t.id)}))
        }))
    ]}
}


