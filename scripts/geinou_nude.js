class PhotoDeckGeinouNudeSource extends ComicSource {
    name = "Geinou Nude"

    key = "photo_deck_geinou_nude"

    version = "0.1.4"

    minAppVersion = "1.17.0"

    siteUrl = "https://geinou-nude.com/"
    url = "https://raw.githubusercontent.com/tide23333-max/venera-photo-sources/main/scripts/geinou_nude.js"

    headers = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.7,en;q=0.6",
        "Referer": "https://geinou-nude.com/"
    }

    imageHeaders = {
        "User-Agent": this.headers["User-Agent"],
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": "https://geinou-nude.com/"
    }

    detailCache = {}

    cleanText(text) {
        return (text ?? "").replace(/\s+/g, " ").trim()
    }

    absoluteUrl(url, base = this.siteUrl) {
        if (!url) return ""
        if (url.startsWith("http://") || url.startsWith("https://")) return url
        if (url.startsWith("//")) return "https:" + url
        if (url.startsWith("/")) return base.replace(/\/$/, "") + url
        return base + url
    }

    async getDocument(path) {
        const response = await Network.get(this.absoluteUrl(path), this.headers)
        if (response.status >= 400) {
            throw `Geinou Nude HTTP ${response.status}: ${path}`
        }
        return new HtmlDocument(response.body)
    }

    albumPath(id) {
        if (!id) return "/"
        if (id.startsWith("http://") || id.startsWith("https://")) return id
        return "/" + String(id).replace(/^\/+|\/+$/g, "") + "/"
    }

    appendPage(path, page) {
        if (!page || page <= 1) return path
        const clean = String(path).replace(/\/$/g, "")
        return `${clean}/page/${page}/`
    }

    pathFromUrl(url) {
        const full = this.absoluteUrl(url)
        const withoutHash = full.split("#")[0]
        const withoutQuery = withoutHash.split("?")[0]
        return withoutQuery.replace(/^https?:\/\/[^/]+/i, "") || "/"
    }

    safeDecode(value) {
        try {
            return decodeURIComponent(value)
        } catch (_) {
            return value
        }
    }

    extractAlbumId(href) {
        if (!href) return ""
        const path = this.pathFromUrl(href)
            .replace(/^\/+|\/+$/g, "")
            .replace(/\/\d+$/g, "")
        if (!path ||
            /^(category|tag|page|search|feed|comments|about|contact|wp-json|wp-content|wp-includes|wp-admin)(\/|$)/.test(path) ||
            /\.(?:css|js|xml|json|ico|png|jpe?g|webp)$/i.test(path)) return ""
        return this.safeDecode(path)
    }

    imageUrl(raw) {
        if (!raw || raw === "#" || raw.startsWith("data:image/")) return ""
        const url = this.absoluteUrl(raw)
        return /\.(jpe?g|png|webp)(\?.*)?$/i.test(url) ? url : ""
    }

    splitSrcset(value) {
        return String(value ?? "")
            .split(",")
            .map((part) => part.trim().split(/\s+/)[0])
            .filter((part) => part.length > 0)
    }

    firstImageUrl(root) {
        const image = root.querySelector("img[data-src], img[src], img[srcset]")
        const candidates = [
            image?.attributes?.["data-src"],
            image?.attributes?.src,
            ...this.splitSrcset(image?.attributes?.srcset)
        ]
        for (const candidate of candidates) {
            const url = this.imageUrl(candidate)
            if (url) return url
        }
        return ""
    }

    extractImageCount(text) {
        const match = /(\d+)\s*(?:枚|画像|photos?|pics?)/i.exec(text ?? "")
        return match ? Number(match[1]) : null
    }

    categoryLabels(root) {
        return root.querySelectorAll("a[href*='/category/']")
            .map((link) => this.cleanText(link.text))
            .filter((text) => text.length > 0)
    }

    nearestArticle(element) {
        let current = element
        for (let depth = 0; depth < 6 && current; depth++) {
            const className = Array.from(current.classes ?? []).join(" ")
            if (current.localName === "article" || className.includes("post")) return current
            current = current.parent
        }
        return element
    }

    listingArticles(doc) {
        const articles = doc.querySelectorAll("article.post_card, article[class*='post-'], article.type-post")
            .filter((article) => article.querySelector("a[href]"))
        if (articles.length) return articles
        return doc.querySelectorAll("a.entry_title[href], h2 a[href]")
            .map((link) => this.nearestArticle(link))
    }

    parseAlbumList(doc) {
        const seen = {}
        const comics = []
        for (const article of this.listingArticles(doc)) {
            const link = article.querySelector("a.entry_title[href]") ??
                article.querySelector("h2 a[href], h3 a[href]") ??
                article.querySelector(".post_card_thum a[href]")
            const href = link?.attributes?.href ?? ""
            const id = this.extractAlbumId(href)
            if (!id || seen[id]) continue
            seen[id] = true
            const title = this.cleanText(link?.attributes?.title || link?.text || id)
            const text = this.cleanText(article.text)
            const cover = this.firstImageUrl(article)
            comics.push({
                id,
                title: title || id,
                subtitle: "Geinou Nude",
                cover,
                tags: this.categoryLabels(article),
                description: this.cleanText(article.querySelector(".summary")?.text) || this.absoluteUrl(href),
                maxPage: this.extractImageCount(`${title} ${text}`),
                language: "image"
            })
        }
        return comics
    }

    parseMaxPage(doc) {
        let maxPage = 1
        for (const link of doc.querySelectorAll("a[href*='/page/']")) {
            const match = /\/page\/(\d+)/.exec(link.attributes.href ?? "")
            const page = Number(match?.[1] ?? "0")
            if (page > maxPage) maxPage = page
        }
        return maxPage
    }

    extractDetailImages(root, id) {
        const images = []
        const seen = {}
        const add = (url, thumb = "") => {
            if (!url || seen[url]) return
            seen[url] = true
            images.push(url)
        }
        for (const link of root.querySelectorAll("a[href]")) {
            const url = this.imageUrl(link.attributes.href)
            if (url) add(url, this.firstImageUrl(link))
        }
        if (images.length) return images
        for (const image of root.querySelectorAll("img[src], img[data-src], img[data-original], img[data-lazy-src], img[srcset]")) {
            const candidates = [
                image.attributes["data-original"],
                image.attributes["data-lazy-src"],
                image.attributes["data-src"],
                image.attributes.src,
                ...this.splitSrcset(image.attributes.srcset)
            ]
            for (const candidate of candidates) add(this.imageUrl(candidate))
        }
        return images
    }

    detailPagePaths(doc, id) {
        const paths = []
        const seen = {}
        for (const link of doc.querySelectorAll("a[href]")) {
            const href = link.attributes.href ?? ""
            const linkedId = this.extractAlbumId(href)
            const page = Number(/\/(\d+)\/?$/.exec(this.pathFromUrl(href))?.[1] ?? "0")
            if (linkedId === id && page > 1 && !seen[href]) {
                seen[href] = true
                paths.push(this.absoluteUrl(href))
            }
        }
        return paths
    }

    parseDetail(doc, id) {
        const root = doc.querySelector("article") ?? doc.body
        const normalizedId = this.extractAlbumId(id) || id
        const title = this.cleanText(root.querySelector("h1")?.text ||
            doc.querySelector("meta[property='og:title']")?.attributes?.content ||
            normalizedId)
        const description = this.cleanText(doc.querySelector("meta[name='description']")?.attributes?.content ||
            root.querySelector(".summary, .entry-content p")?.text)
        const images = this.extractDetailImages(root, normalizedId)
        const tags = this.categoryLabels(root)
        const imageCount = this.extractImageCount(`${root.text} ${title}`) ?? images.length
        return {
            title,
            subtitle: tags.join(", "),
            cover: images[0] ?? this.firstImageUrl(root),
            description,
            tags: {
                "category": tags,
                "source": ["Geinou Nude"]
            },
            chapters: {
                "main": "Photos"
            },
            thumbnails: images,
            uploadTime: this.cleanText(root.querySelector(".post_date, time")?.text),
            updateTime: "",
            uploader: "Geinou Nude",
            url: this.absoluteUrl(this.albumPath(normalizedId)),
            maxPage: imageCount,
            stars: null
        }
    }

    explore = [
        {
            title: "Geinou Nude Latest",
            type: "multiPageComicList",
            load: async (page) => {
                const doc = await this.getDocument(page > 1 ? `/page/${page}/` : "/")
                try {
                    return {
                        comics: this.parseAlbumList(doc),
                        maxPage: this.parseMaxPage(doc)
                    }
                } finally {
                    doc.dispose()
                }
            }
        }
    ]

    search = {
        load: async (keyword, options, page) => {
            const query = `?s=${encodeURIComponent(keyword ?? "")}`
            const path = page > 1 ? `/page/${page}/${query}` : `/${query}`
            const doc = await this.getDocument(path)
            try {
                return {
                    comics: this.parseAlbumList(doc),
                    maxPage: this.parseMaxPage(doc)
                }
            } finally {
                doc.dispose()
            }
        }
    }

    category = {
        title: "Geinou Categories",
        parts: [
            {
                name: "Category",
                type: "fixed",
                itemType: "search",
                categories: ["水着", "グラビア", "写真集", "アイドル", "女優", "モデル"]
            }
        ],
        enableRankingPage: false
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            if (!param || !String(param).startsWith("/")) {
                return this.search.load(param || category, options, page)
            }
            let doc
            try {
                doc = await this.getDocument(this.appendPage(param, page ?? 1))
            } catch (error) {
                if (String(error).includes("HTTP 404")) {
                    throw error
                }
                throw error
            }
            try {
                return {
                    comics: this.parseAlbumList(doc),
                    maxPage: this.parseMaxPage(doc)
                }
            } finally {
                doc.dispose()
            }
        }
    }

    comic = {
        idMatch: "^(?:https?://geinou-nude\\.com/(?!search/|category/|tag/|feed/|comments/|about/|contact/|wp-)[^\\s?#]+/?|/(?!search/|category/|tag/|feed/|comments/|about/|contact/|wp-)[^\\s?#]+/|[A-Za-z0-9][A-Za-z0-9_-]+(?:/\\d+)?/?)$",
        loadInfo: async (id) => {
            const doc = await this.getDocument(this.albumPath(id))
            try {
                const detail = this.parseDetail(doc, id)
                const allImages = [...detail.thumbnails]
                for (const path of this.detailPagePaths(doc, id)) {
                    const pageDoc = await this.getDocument(path)
                    try {
                        for (const image of this.parseDetail(pageDoc, id).thumbnails) {
                            if (!allImages.includes(image)) allImages.push(image)
                        }
                    } finally {
                        pageDoc.dispose()
                    }
                }
                detail.thumbnails = allImages
                detail.maxPage = Math.max(detail.maxPage ?? 0, allImages.length)
                this.detailCache[id] = detail
                return detail
            } finally {
                doc.dispose()
            }
        },
        loadEp: async (id, ep) => {
            const cachedImages = this.detailCache[id]?.thumbnails
            if (cachedImages?.length) return { images: cachedImages }
            const detail = await this.comic.loadInfo(id)
            return { images: detail.thumbnails }
        },
        onImageLoad: async (imageKey, id, ep) => {
            return {
                url: imageKey,
                headers: this.imageHeaders
            }
        },
        onThumbnailLoad: (imageKey) => {
            return {
                url: imageKey,
                headers: this.imageHeaders
            }
        },
        link: {
            domains: ["geinou-nude.com"],
            linkToId: (url) => this.extractAlbumId(url)
        }
    }
    // Public taxonomy cache only. Reader IDs, chapters and image extraction stay unchanged.
    catalog = []
    catalogStaging = null
    catalogBusy = false
    catalogPending = {}
    catalogDetailTimes = {}
    catalogClean(v) { return String(v ?? "").replace(/\s+/g, " ").trim() }
    catalogNamespace(v) {
        const n = this.catalogClean(v).toLowerCase()
        if (/^(model|models|人物|模特)$/.test(n)) return "Model"
        if (/^(vendor|vendors|厂商|社团)$/.test(n)) return "Vendor"
        if (/^(tag|tags|标签)$/.test(n)) return "Tags"
        if (/^(country|地区)$/.test(n)) return "Country"
        if (/^(type|类型)$/.test(n)) return "Type"
        if (/^(source|来源)$/.test(n)) return "Source"
        return "Category"
    }
    catalogPath(raw) {
        let s = String(raw ?? "").trim().replace(/&amp;/g, "&")
        if (!s || s.startsWith("#") || /^(?:javascript|data|file):/i.test(s)) return ""
        const absolute = /^(?:https?:)?\/\/([^/]+)(\/.*)?$/i.exec(s)
        if (absolute) {
            const host = absolute[1].toLowerCase()
            const baseHost = /^https?:\/\/([^/]+)/.exec(this.siteUrl)?.[1]?.toLowerCase()
            const aliases = [...(this.hosts || []), baseHost, "www." + baseHost]
            if (this.key === "photo_deck_girlstop") aliases.push("me.girlstop.info","en.girlstop.info","girlstop.info")
            if (!aliases.includes(host)) return ""
            s = absolute[2] || "/"
        }
        if (!s.startsWith("/")) s = "/" + s
        s = s.split("#")[0]
        const queryIndex=s.indexOf("?")
        if(queryIndex>=0){
            const query=s.slice(queryIndex+1).split("&").filter(p=>p && !/^(?:page|paged|query-\d+-page)=\d+$/.test(p)).join("&")
            s=s.slice(0,queryIndex)+(query?"?"+query:"")
        }
        // Canonical percent escapes avoid case-only duplicates without decoding separators.
        return s.replace(/%[a-f0-9]{2}/gi, x => x.toUpperCase())
    }
    catalogRemember(namespace, name, raw) {
        const ns=this.catalogNamespace(namespace), label=this.catalogClean(name), path=this.catalogPath(raw)
        if (!label || !path || path === "/" || ns === "Source") return label
        const entries=this.catalogStaging || this.catalog
        const same=entries.find(e=>e.ns===ns && e.path===path)
        if (same) return same.label
        const clash=entries.find(e=>e.ns===ns && e.label===label)
        let shown=label
        if(clash) {
            const tail=path.split("?")[1] || path.replace(/\/$/,"").split("/").pop()
            shown=label+"（"+tail+"）"
        }
        entries.push({ns,label:shown,path,original:label})
        if(!this.catalogStaging) this.saveData("taxonomy_v1",this.catalog)
        return shown
    }
    catalogExcluded(node, directory=false) {
        let p=node
        for(let i=0;p&&i<16;i++,p=p.parent) {
            if(p.localName==="body" || p.localName==="html")break
            const cls=String(p.attributes?.class || "").toLowerCase()
            const id=String(p.attributes?.id || "").toLowerCase()
            if(/related|recommend|sidebar|widget|advert|footer|ads(?:\s|$)/.test(cls+" "+id) || p.localName==="footer" || p.localName==="aside")return true
            if(!directory && (p.localName==="nav" || /(?:^|\s)(?:menu|navigation)(?:\s|$)/.test(cls)))return true
        }
        return false
    }
    catalogCollect(root,directory=false) {
        const found=[]
        for(const a of root?.querySelectorAll?.("a[href]") || []) {
            if(this.catalogExcluded(a,directory))continue
            const path=this.catalogPath(a.attributes.href), label=this.catalogClean(a.text || a.attributes.title)
            if(!path || !label || /^(?:more|next|previous|tags?|models?|category|categories|\.\.\.)$/i.test(label))continue
            let ns=""
            if(this.key==="photo_deck_girlstop") {
                if(/\/tags\.php\?/.test(path)&&/[?&]id=\d+/.test(path))ns="Tags"
                if(/\/models\.php\?/.test(path)&&/[?&]name=/.test(path))ns="Model"
            } else if(this.key==="photo_deck_v2ph") {
                if(/\/(?:actor|model)\//.test(path))ns="Model"
                else if(/\/(?:company|vendor)\//.test(path))ns="Vendor"
                else if(/\/country\//.test(path))ns="Country"
                else if(/\/(?:category|tag)\//.test(path))ns="Tags"
            } else if(this.key==="photo_deck_danryoku") {
                if(/\/tag\//.test(path))ns="Model"
                else if(/\/category\/country\//.test(path))ns="Country"
                else if(/\/category\//.test(path))ns="Type"
            } else {
                if(this.key==="photo_deck_4khd" && /^\/pages\/(popular|cosplay|album)(?:[/?]|$)/.test(path))ns="Category"
                if(this.key==="photo_deck_everia_club" && /^\/(Gravure|Japan|Korea|Thailand|Chinese|Cosplay)\.html(?:[?]|$)/i.test(path))ns=/\/(Gravure|Cosplay)\.html/i.test(path)?"Type":"Country"
                if(/\/category\//.test(path))ns="Category"
                else if(/\/tag\/|[?&]tag=/.test(path)||a.attributes.rel==="tag")ns="Tags"
            }
            if(!ns)continue
            const shown=this.catalogRemember(ns,label,path)
            if(!found.some(e=>e.ns===ns&&e.path===path))found.push({ns,label:shown,path,original:label})
        }
        return found
    }
    catalogTarget(label,path) { return {page:"category",attributes:{category:label,param:path}} }
    catalogClick(ns,label) {
        const kind=this.catalogNamespace(ns)
        if(kind==="Source")return null
        const item=this.catalog.find(e=>e.ns===kind&&e.label===this.catalogClean(label))
        if(item)return this.catalogTarget(item.label,item.path)
        // Never interpret unknown GirlStop tags as model names.
        if(this.key==="photo_deck_girlstop" && kind!=="Model") {
            UI.showMessage("该标签没有可靠链接，请刷新标签目录后重试。")
            return null
        }
        return {page:"search",attributes:{text:this.catalogClean(label),options:[]}}
    }
    catalogParts() {
        const names={Model:this.key==="photo_deck_danryoku"?"人物／社团":"人物／模特",Vendor:"厂商／社团",Tags:"标签",Country:"地区",Type:"内容类型",Category:"分类"}
        const order=["Country","Type","Category","Model","Vendor","Tags"]
        // Venera parses part definitions before init; keep a stable loader, not dynamically added headings.
        return [{name:"已缓存目录（类型／首字符排序）",type:"dynamic",loader:()=>{
            if(!this.catalog.length)return [{label:"浏览最新内容以积累目录；也可到源设置手动刷新",target:this.catalogTarget("最新","/")}]
            return [...this.catalog].sort((a,b)=>order.indexOf(a.ns)-order.indexOf(b.ns)||(a.label.toUpperCase()<b.label.toUpperCase()?-1:a.label.toUpperCase()>b.label.toUpperCase()?1:0))
                .map(e=>({label:names[e.ns]+" · "+e.label.charAt(0).toUpperCase()+" · "+e.label,target:this.catalogTarget(e.label,e.path)}))
        }}]
    }
    catalogMenu(legacy) {
        const fixed=(name,items)=>({name,type:"fixed",categories:items.map(([label,path])=>({label,target:this.catalogTarget(label,path)}))})
        let parts=[]
        if(this.key==="photo_deck_4khd"){
            parts=[fixed("原站入口",[["最新","/"],["热门","/pages/popular"],["Cosplay","/pages/cosplay"],["写真集","/pages/album"]]),
                {name:"快捷搜索",type:"fixed",categories:["twitter","写真"].map(label=>({label,target:{page:"search",attributes:{text:label,options:[]}}}))}]
        }else if(this.key==="photo_deck_danryoku"){
            parts=[fixed("内容类型",[["全部","/"],["原站内容分类","/category/nsfw/"],["Cosplay","/category/cosplay/"]]),
                fixed("地区",[["日本","/category/country/japan/"],["中国","/category/country/china/"],["韩国","/category/country/korea/"],["台湾","/category/country/taiwan/"],["欧美","/category/country/western/"]])]
        }else if(this.key==="photo_deck_everia_club"){
            parts=[fixed("内容类型",[["写真","/Gravure.html"],["Cosplay","/Cosplay.html"]]),
                fixed("地区",[["日本","/Japan.html"],["韩国","/Korea.html"],["泰国","/Thailand.html"],["中国","/Chinese.html"]])]
        }else if(this.key==="photo_deck_geinou_nude"){
            const words=["水着","グラビア","写真集","アイドル","女優","モデル"]
            parts=[{name:"常用入口（无目录映射时搜索）",type:"dynamic",loader:()=>words.map(label=>{
                const item=this.catalog.find(e=>e.label===label && e.ns==="Category")
                return {label,target:item?this.catalogTarget(label,item.path):{page:"search",attributes:{text:label,options:[]}}}
            })}]
        }else{
            parts=legacy.parts.map(p=>({...p,name:p.name==="热门标签"?"常用快捷分类":p.name==="Tag"?"常用标签":p.name}))
            if(this.key==="photo_deck_v2ph"){
                const first=parts[0], vendors=[],categories=[],params=[]
                for(let i=0;i<first.categories.length;i++){
                    if(String(first.categoryParams[i]).startsWith("/company/"))vendors.push([first.categories[i],first.categoryParams[i]])
                    else {categories.push(first.categories[i]);params.push(first.categoryParams[i])}
                }
                first.categories=categories;first.categoryParams=params
                if(vendors.length)parts.push(fixed("厂商快捷入口",vendors))
            }
        }
        return {title:this.name+" 分类",enableRankingPage:false,parts:[...parts,...this.catalogParts()]}
    }
    catalogRefreshView(){this.category=this.catalogMenu(this.catalogLegacy)}
    async catalogFetch(path) {
        const target=this.absoluteUrl(path)
        const headers=typeof this.requestHeaders==="function"?this.requestHeaders(target):this.headers
        const r=await Network.get(target,headers)
        const body=String(r.body || "")
        if(r.status===403 || r.status===429 || this.isCloudflareChallenge?.(r) || /<title>\s*Just a moment|captcha-form|unusual traffic|\/sorry\/index/i.test(body))throw new Error(this.name+"：目录访问受限，已停止；旧缓存保留。")
        if(r.status<200 || r.status>=300)throw new Error(this.name+"：目录 HTTP "+r.status+"，旧缓存保留。")
        return new HtmlDocument(body)
    }
    async refreshCatalog(){
        if(this.catalogBusy)throw new Error("目录正在刷新，请勿重复点击。")
        this.catalogBusy=true;this.catalogStaging=[]
        try{
            const paths=this.key==="photo_deck_girlstop"?["/tags.php","/models.php"]:["/"]
            for(const path of paths){
                const doc=await this.catalogFetch(path)
                try{this.catalogCollect(doc,true)}finally{doc.dispose()}
            }
            if(!this.catalogStaging.length && this.key!=="photo_deck_4khd" && this.key!=="photo_deck_everia_club")throw new Error("未取得目录链接，旧缓存保留。")
            // Merge the navigation/visible directory with browsed entries. Never claim a whole-site catalog.
            const fresh=this.catalogStaging
            for(const e of this.catalog)if(!fresh.some(x=>x.ns===e.ns&&x.path===e.path))fresh.push(e)
            this.catalog=fresh;this.saveData("taxonomy_v1",this.catalog)
            this.saveData("taxonomy_status",{at:Date.now(),scope:"原站导航／当前目录页＋浏览缓存"})
            this.catalogRefreshView()
            UI.showMessage("已缓存 "+this.catalog.length+" 项；人物目录仅含当前取得的页面，不代表全站。请重新打开分类页。")
        }finally{this.catalogStaging=null;this.catalogBusy=false}
    }
    catalogBoundDetails(){
        const ids=Object.keys(this.catalogDetailTimes).sort((a,b)=>this.catalogDetailTimes[b]-this.catalogDetailTimes[a])
        for(const id of ids.slice(24)) {
            delete this.catalogDetailTimes[id]
            for(const bucket of [this.detailCache,this.readerImageCache])if(bucket)for(const key of Object.keys(bucket)){
                const normalized=this.normalizeAlbumId?.(key)||this.extractAlbumId?.(key)||key
                if(normalized===id)delete bucket[key]
            }
            if(this.rawBodyCache)for(const path of Object.keys(this.rawBodyCache)){
                if(this.extractAlbumId?.(path)===id)delete this.rawBodyCache[path]
            }
        }
        if(this.rawBodyCache){
            const keys=Object.keys(this.rawBodyCache)
            // Raw request bodies are ephemeral; do not retain arbitrarily many pagination responses.
            for(const key of keys.slice(0,Math.max(0,keys.length-240)))delete this.rawBodyCache[key]
        }
    }
    constructor(){super();this.catalogInstall()}
    init(){
        const saved=this.loadData("taxonomy_v1")
        this.catalog=Array.isArray(saved)?saved.filter(e=>e&&e.ns&&e.label&&this.catalogPath(e.path)):[]
    }
    catalogInstall(){
        this.catalogLegacy=this.category
        this.catalogRefreshView()
        this.settings={...(this.settings||{}),
            refreshCatalog:{title:"刷新分类／标签目录",type:"callback",buttonText:"刷新目录",callback:()=>this.refreshCatalog()},
            catalogStatus:{title:"目录缓存状态",type:"callback",buttonText:"查看状态",callback:()=>UI.showMessage("已缓存 "+this.catalog.length+" 项；仅已取得的公开目录与浏览记录，不保证全站完整。")},
            clearCatalog:{title:"清空分类／标签缓存（不影响收藏与历史）",type:"callback",buttonText:"清空目录",callback:()=>{
                if(this.catalogBusy)throw new Error("请等待刷新结束。")
                this.catalog=[];this.saveData("taxonomy_v1",[]);this.saveData("taxonomy_status",{});this.catalogRefreshView();UI.showMessage("目录已清空，收藏与历史未修改。")
            }}
        }
        this.comic.onClickTag=(ns,label)=>this.catalogClick(ns,label)
        const original=this.comic.loadInfo.bind(this)
        this.comic.loadInfo=async id=>{
            const normalized=this.normalizeAlbumId?.(id)||this.extractAlbumId?.(id)||String(id)
            const old=this.detailCache?.[normalized]
            if(old&&Date.now()-(this.catalogDetailTimes[normalized]||0)<600000)return old
            if(old){
                for(const bucket of [this.detailCache,this.readerImageCache])if(bucket)for(const key of Object.keys(bucket))if((this.normalizeAlbumId?.(key)||this.extractAlbumId?.(key)||key)===normalized)delete bucket[key]
                if(this.rawBodyCache)for(const key of Object.keys(this.rawBodyCache))if(this.extractAlbumId?.(key)===normalized)delete this.rawBodyCache[key]
            }
            const key="detail:"+normalized
            if(this.catalogPending[key])return await this.catalogPending[key]
            this.catalogPending[key]=(async()=>{
                const value=await original(id)
                this.catalogDetailTimes[normalized]=Date.now();this.catalogBoundDetails()
                return value
            })()
            try{return await this.catalogPending[key]}finally{delete this.catalogPending[key]}
        }
        for(const [obj,field,prefix] of [[this.categoryComics,"load","category"],[this.search,"load","search"],...this.explore.map((e,i)=>[e,"load","explore"+i])]){
            if(!obj||typeof obj[field]!=="function")continue
            const fn=obj[field].bind(this)
            obj[field]=async(...args)=>{
                const key=prefix+":"+JSON.stringify(args)
                if(this.catalogPending[key])return await this.catalogPending[key]
                this.catalogPending[key]=fn(...args)
                try{const result=await this.catalogPending[key];this.catalogRefreshView();return result}finally{delete this.catalogPending[key]}
            }
        }
        const listParse=this.parseAlbumList.bind(this)
        this.parseAlbumList=doc=>{
            const result=listParse(doc)
            const roots=this.listingItems?.(doc)||this.listingArticles?.(doc)||doc.querySelectorAll("article")
            for(const root of roots)this.catalogCollect(root)
            this.catalogRefreshView()
            return result
        }
        const parse=this.parseDetail.bind(this)
        this.parseDetail=(doc,id)=>{
            const detail=parse(doc,id)
            const root=this.key==="photo_deck_girlstop"?doc:(doc.querySelector("article")||doc.querySelector("main")||doc.body)
            const entries=this.catalogCollect(root)
            // Preserve original linked/text metadata; supplement only this article's real links.
            if(this.key==="photo_deck_4khd")detail.tags={category:entries.filter(e=>e.ns==="Category").map(e=>e.label),tag:entries.filter(e=>e.ns==="Tags").map(e=>e.label),source:["SZZS / 4KHD"]}
            for(const ns of ["Model","Vendor","Tags","Country","Type","Category"]){
                const existing=Object.keys(detail.tags||{}).find(k=>this.catalogNamespace(k)===ns)
                const linked=entries.filter(e=>e.ns===ns).map(e=>e.label)
                if(linked.length)detail.tags[existing||ns]=Array.from(new Set([...(detail.tags[existing]||[]).filter(v=>!entries.some(e=>e.ns===ns&&e.original===v)),...linked]))
            }
            this.catalogRefreshView()
            return detail
        }
    }

}

