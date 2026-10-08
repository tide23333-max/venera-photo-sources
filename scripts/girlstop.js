class PhotoDeckGirlStopSource extends ComicSource {
    name = "GirlStop"

    key = "photo_deck_girlstop"

    version = "0.1.4"

    minAppVersion = "1.17.0"

    siteUrl = "https://me.girlstop.info/"
    url = "https://raw.githubusercontent.com/tide23333-max/venera-photo-sources/main/scripts/girlstop.js"

    headers = {
        "user-agent": "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://me.girlstop.info/"
    }

    imageHeaders = {
        "user-agent": this.headers["user-agent"],
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": "https://me.girlstop.info/"
    }

    detailCache = {}
    sessionOrigin = ""
    webLoginUrl = ""

    account = {
        loginWithWebview: {
            url: "https://me.girlstop.info/",
            checkStatus: (url, title) => {
                const currentUrl = String(url ?? "")
                const currentTitle = String(title ?? "").toLowerCase()
                if (!/^https:\/\/(me|en|www)\.girlstop\.info\//i.test(currentUrl)) return false
                if (!currentTitle) return false
                if (currentTitle.includes("just a moment")) return false
                if (currentTitle.includes("attention required")) return false
                if (currentTitle.includes("forbidden")) return false
                if (currentTitle.includes("403")) return false
                if (/cloudflare|blocked|access denied|captcha|验证/.test(currentTitle)) return false
                this.webLoginUrl = currentUrl
                return true
            },
            onLoginSuccess: async () => {
                // Native Venera has saved cookies for the actual final WebView URL.
                // Follow that verified origin; do not copy cookies between sibling hosts.
                const origin = /^https:\/\/(?:me|en|www)\.girlstop\.info\//i.exec(this.webLoginUrl)?.[0] ?? ""
                if (!origin) { UI.showMessage("未确认验证页面的域名，请重新打开源内验证窗口。"); return }
                this.sessionOrigin = origin
                this.saveData("girlstop_session_origin", origin)
                this.detailCache = {}; this.catalogDetailTimes = {}; this.girlCategoryPages = {}
                const cookies = Network.getCookies(this.webLoginUrl) ?? []
                UI.showMessage(cookies.some(c => c.name === "cf_clearance" && c.value)
                    ? "已保存实际验证域名的会话，请刷新 GirlStop。是否有效以实际加载为准。"
                    : "页面已打开，但没有取得 cf_clearance。请刷新测试；若仍是 403，不要反复重试，反馈验证窗口画面。")
            },
        },
        logout: () => {
            Network.deleteCookies("https://me.girlstop.info/")
            Network.deleteCookies("https://en.girlstop.info/")
            Network.deleteCookies("https://www.girlstop.info/")
            this.sessionOrigin = ""; this.webLoginUrl = ""
            this.saveData("girlstop_session_origin", "")
        },
        registerWebsite: null
    }

    absoluteUrl(url, base = this.sessionOrigin || this.siteUrl) {
        if (!url) return ""
        if (url.startsWith("http://") || url.startsWith("https://")) return url
        if (url.startsWith("//")) return "https:" + url
        if (url.startsWith("/")) return base.replace(/\/$/, "") + url
        return base + url
    }

    cleanText(text) {
        return (text ?? "").replace(/\s+/g, " ").trim()
    }

    async getDocument(url) {
        const target = this.absoluteUrl(url)
        const response = await Network.get(target, { ...this.headers, Referer: this.sessionOrigin || this.siteUrl })
        const body = String(response.body ?? "")
        if (/sorry, you have been blocked|you are unable to access/i.test(body) ||
            (response.status === 403 && /cf-error-details/i.test(body))) {
            throw "GirlStop 被网站安全规则阻止（403 封禁页），不是空图集。请在本源账号设置打开 WebView 确认；若同样被阻止，验证／改解析规则不能保证解除，请停止重复刷新。"
        }
        if (this.isCloudflareChallenge(response)) {
            throw "GirlStop Cloudflare verification required. Open this source account settings and use Login with webview once, then retry."
        }
        if (response.status >= 400) {
            throw `GirlStop HTTP ${response.status}: ${url}`
        }
        return new HtmlDocument(response.body)
    }

    isCloudflareChallenge(response) {
        const headers = response?.headers ?? {}
        const mitigated = String(
            headers["cf-mitigated"] ??
            headers["Cf-Mitigated"] ??
            headers["CF-Mitigated"] ??
            ""
        ).toLowerCase()
        const body = String(response?.body ?? "").toLowerCase()
        return response?.status === 403 && (
            mitigated.includes("challenge") ||
            body.includes("cf-mitigated") ||
            body.includes("just a moment") ||
            body.includes("challenge-platform") ||
            body.includes("window._cf_chl_opt")
        )
    }

    firstImageUrl(root) {
        const image = root.querySelector("img")
        const src = image?.attributes?.src
        if (src) return this.absoluteImageUrl(src)
        const source = root.querySelector("source[srcset]")
        const srcset = source?.attributes?.srcset
        if (srcset) return this.absoluteImageUrl(srcset.split(",")[0].trim().split(" ")[0])
        return ""
    }

    absoluteImageUrl(url) {
        if (!url) return ""
        if (url.startsWith("http://") || url.startsWith("https://")) return url
        if (url.startsWith("//")) return "https:" + url
        if (url.startsWith("/cat/") || url.startsWith("/img/")) {
            return this.absoluteUrl(url, "https://girlstop.top/")
        }
        return this.absoluteUrl(url)
    }

    albumIdFromHref(href) {
        const match = /[?&]id=(\d+)/.exec(href ?? "")
        return match?.[1] ?? ""
    }

    parseMaxPage(doc) {
        let maxPage = 1
        // Current website paginator uses zero-based query pages, but a total page count.
        for (const script of doc.querySelectorAll("script")) {
            const total = Number(/new\s+Paginator\s*\(\s*['"]pager['"]\s*,\s*(\d+)/.exec(script.text ?? "")?.[1] ?? "0")
            if (total > maxPage) maxPage = total
        }
        for (const item of doc.querySelectorAll("a[href*='page=']")) {
            const page = Number(/[?&]page=(\d+)/.exec(item.attributes.href ?? "")?.[1] ?? "0")
            if (page + 1 > maxPage) maxPage = page + 1
        }
        return maxPage
    }

    parseAlbumList(doc) {
        const seen = {}
        const comics = []
        for (const item of doc.querySelectorAll(".gallery-list a.gallery-item[href], section.gallery a.gallery-item[href], a[href*='psto.php?id=']")) {
            const href = item.attributes.href ?? ""
            const id = this.albumIdFromHref(href) || item.attributes.rel || item.attributes.code || ""
            if (!id || seen[id]) continue
            seen[id] = true
            const image = item.querySelector("img")
            const title = this.cleanText(image?.attributes?.alt || item.attributes.title || id)
            const cover = this.firstImageUrl(item)
            comics.push({
                id,
                title: title || id,
                subtitle: "GirlStop",
                cover,
                tags: ["GirlStop"],
                description: this.absoluteUrl(href),
                language: "image"
            })
        }
        return comics
    }

    parseInfoText(doc, pattern) {
        const info = this.cleanText(doc.querySelector("#psto_info")?.text)
        return pattern.exec(info)?.[1] ?? null
    }

    parseDetail(doc, id) {
        const title = this.cleanText(doc.querySelector("main h1")?.text || doc.querySelector("title")?.text || id)
        const description = this.cleanText(doc.querySelector("h2.h2-post")?.text)
        const models = doc.querySelectorAll("#psto_info a[href*='models.php?name=']")
            .map((e) => this.cleanText(e.text))
            .filter((e) => e.length > 0)
        const tags = doc.querySelectorAll(".taglist a[href*='tags.php']")
            .map((e) => this.cleanText(e.text))
            .filter((e) => e.length > 0 && e !== "...")
        const thumbs = []
        const readerImages = []
        const imageFallbacks = {}
        const photoItems = doc.querySelectorAll(".psto_item")
        for (const item of photoItems) {
            const link = item.querySelector("a.fullimg[href], a.full[href]") ?? item.querySelector("a[href*='/cat/posts/']")
            const image = this.firstImageUrl(link ?? item)
            if (image && !thumbs.includes(image)) thumbs.push(image)
            const href = this.absoluteImageUrl(link?.attributes?.href ?? "")
            const full = /^https?:\/\/[^/]+\/cat\/posts\/[^?#]+\.(?:avif|webp|jpe?g|png)(?:[?#]|$)/i.test(href) ? href : image
            if (full && !readerImages.includes(full)) {
                readerImages.push(full)
                if (image && image !== full) imageFallbacks[full] = image
            }
        }
        if (thumbs.length === 0) {
            for (const image of doc.querySelectorAll("img.photo450")) {
                const src = image.attributes.src
                const imageUrl = this.absoluteImageUrl(src)
                if (imageUrl && !thumbs.includes(imageUrl)) thumbs.push(imageUrl)
            }
        }
        if (!readerImages.length) readerImages.push(...thumbs)
        if (!readerImages.length) throw "GirlStop 正文中没有可读取的图片，可能是验证页或页面结构变化。请反馈图集网址。"
        const rating = Number(this.parseInfoText(doc, /Rating:\s*([0-9]+(?:\.[0-9]+)?)/i) ?? "0")
        const pics = Number(this.parseInfoText(doc, /Pics:\s*(\d+)/i) ?? `${thumbs.length}`)
        return {
            title,
            subtitle: models.join(", "),
            cover: thumbs[0] ?? "",
            description,
            tags: {
                "model": models,
                "tag": tags,
                "source": ["GirlStop"]
            },
            chapters: {
                "main": "Photos"
            },
            thumbnails: thumbs,
            // Private JS cache fields: previews stay separate from full reader URLs.
            _readerImages: readerImages,
            _imageFallbacks: imageFallbacks,
            uploadTime: "",
            updateTime: "",
            uploader: "GirlStop",
            url: this.absoluteUrl(`psto.php?id=${id}`),
            maxPage: pics || thumbs.length,
            stars: rating ? Math.min(5, rating / 2) : null
        }
    }

    explore = [
        {
            title: "GirlStop Latest",
            type: "multiPageComicList",
            load: async (page) => {
                const current = Math.max(1, Number(page) || 1)
                const doc = await this.getDocument(`index.php?page=${current - 1}`)
                try {
                    return {
                        comics: this.parseAlbumList(doc),
                        maxPage: Math.max(current, this.parseMaxPage(doc))
                    }
                } finally {
                    doc.dispose()
                }
            }
        }
    ]

    category = {
        title: "GirlStop Tags",
        parts: [
            {
                name: "Tag",
                type: "fixed",
                itemType: "category",
                categories: ["summer", "smiling", "cute", "indoors", "fashion", "glamour"],
                categoryParams: ["tags.php?id=2&n", "tags.php?id=13&n", "tags.php?id=22&n", "tags.php?id=27&n", "tags.php?id=29&n", "tags.php?id=47&n"]
            }
        ],
        enableRankingPage: false
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let base=this.catalogPath(param || "/")
            // The site's own date-sort link is stable; relevance order changes between requests.
            if(/^\/tags\.php\?/.test(base) && !/[?&](?:date|rate)(?:[=&]|$)/.test(base))base+="&date"
            const current=Math.max(1,Number(page)||1)
            let doc
            if(current>1 && this.girlCategoryPages[base]===undefined){
                const first=await this.getDocument(base)
                try{this.girlCategoryPages[base]=this.girlNextPage(first,base)===1?0:1}finally{first.dispose()}
            }
            const joiner=base.includes("?")?"&":"?"
            doc=await this.getDocument(current===1?base:`${base}${joiner}page=${current-(this.girlCategoryPages[base]===0?1:0)}`)
            try {
                const next=this.girlNextPage(doc,base)
                if(current===1)this.girlCategoryPages[base]=next===1?0:1
                return {
                    comics: this.parseAlbumList(doc),
                    maxPage: next===null?current:current+1
                }
            } finally {
                doc.dispose()
            }
        }
    }

    girlCategoryPages = {}
    girlNextPage(doc,base){
        for(const a of doc.querySelectorAll("main a[href]")){
            if(!/^next$/i.test(this.cleanText(a.text)))continue
            if(this.catalogPath(a.attributes.href)!==base)continue
            const match=/[?&]page=(\d+)/.exec(a.attributes.href)
            if(match)return Number(match[1])
        }
        return null
    }

    tagSearchParams = {
        "summer": "tags.php?id=2&n",
        "smiling": "tags.php?id=13&n",
        "cute": "tags.php?id=22&n",
        "indoors": "tags.php?id=27&n",
        "fashion": "tags.php?id=29&n",
        "glamour": "tags.php?id=47&n"
    }

    searchPath(keyword, page) {
        const sitePage = Math.max(1, Number(page) || 1) - 1
        const text = this.cleanText(keyword)
        const lower = text.toLowerCase()
        const tagMatch = /^tag\s*:\s*(.+)$/i.exec(text)
        const tagName = this.cleanText(tagMatch?.[1] ?? lower)
            .toLowerCase()
            .replace(/\s+/g, "-")
        const tagParam = this.tagSearchParams[tagName]
        if (tagMatch && tagParam) {
            return `${tagParam}&page=${sitePage}`
        }
        if (this.tagSearchParams[lower] && !text.includes(" ")) {
            return `${this.tagSearchParams[lower]}&page=${sitePage}`
        }
        const model = encodeURIComponent(text.replace(/\s+/g, " "))
        return `models.php?name=${model}&page=${sitePage}`
    }

    search = {
        load: async (keyword, options, page) => {
            const doc = await this.getDocument(this.searchPath(keyword, page))
            try {
                return {
                    comics: this.parseAlbumList(doc),
                    maxPage: Math.max(1, Number(page) || 1, this.parseMaxPage(doc))
                }
            } finally {
                doc.dispose()
            }
        }
    }

    comic = {
        idMatch: "^\\d+$",
        loadInfo: async (id) => {
            const doc = await this.getDocument(`psto.php?id=${id}`)
            try {
                const detail = this.parseDetail(doc, id)
                this.detailCache[id] = detail
                return detail
            } finally {
                doc.dispose()
            }
        },
        loadEp: async (id, ep) => {
            const cachedImages = this.detailCache[id]?._readerImages
            if (cachedImages?.length) {
                return {
                    images: cachedImages
                }
            }
            const detail = await this.comic.loadInfo(id)
            return { images: detail._readerImages }
        },
        onImageLoad: async (imageKey, id, ep) => {
            const fallback = this.detailCache[id]?._imageFallbacks?.[imageKey]
            const config = {
                url: imageKey,
                headers: this.imageHeaders
            }
            // Use only the preview URL actually present in this article; never guess paths.
            // Returned fallback has no failure callback, so it cannot cycle back to the original.
            if (fallback && fallback !== imageKey) config.onLoadFailed = () => ({ url: fallback, headers: this.imageHeaders })
            return config
        },
        onThumbnailLoad: (imageKey) => {
            return {
                url: imageKey,
                headers: this.imageHeaders
            }
        },
        link: {
            domains: ["girlstop.info", "me.girlstop.info", "en.girlstop.info"],
            linkToId: (url) => {
                return this.albumIdFromHref(url)
            }
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
        const origin=this.loadData("girlstop_session_origin")
        this.sessionOrigin=/^https:\/\/(?:me|en|www)\.girlstop\.info\/$/i.test(String(origin ?? ""))?origin:""
        const saved=this.loadData("taxonomy_v1")
        this.catalog=Array.isArray(saved)?saved.filter(e=>e&&e.ns&&e.label&&this.catalogPath(e.path)):[]
    }
    catalogInstall(){
        this.catalogLegacy=this.category
        this.catalogRefreshView()
        this.settings={...(this.settings||{}),
            sessionHint:{title:"403／网站验证说明",type:"callback",buttonText:"查看说明",callback:()=>UI.showMessage("本源账号设置的 WebView 会保存实际打开域名的会话。若出现 Sorry, you have been blocked，这是网站封禁页，不能当作空图集或验证成功；停止重复刷新。源更新不会自动解除网络／网站限制。")},
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
