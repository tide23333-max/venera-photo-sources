class PhotoDeck4khdSource extends ComicSource {
    name = "SZZS / 4KHD"

    key = "photo_deck_4khd"

    version = "0.1.7"

    minAppVersion = "1.17.0"

    siteUrl = "https://www.4khd.com/"
    url = "https://raw.githubusercontent.com/tide23333-max/venera-photo-sources/main/scripts/4khd.js"

    headers = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.7,en;q=0.6",
        "Referer": "https://www.4khd.com/"
    }

    imageHeaders = {
        "User-Agent": this.headers["User-Agent"],
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": "https://www.4khd.com/"
    }

    detailCache = {}

    cleanText(text) {
        return (text ?? "").replace(/\s+/g, " ").trim()
    }

    normalizeHost(url) {
        return String(url ?? "")
            .replace(/^http:\/\/4khd\.com/i, "https://www.4khd.com")
            .replace(/^https:\/\/4khd\.com/i, "https://www.4khd.com")
            .replace(/^http:\/\/szzs\.uuss\.uk/i, "https://www.4khd.com")
            .replace(/^https:\/\/szzs\.uuss\.uk/i, "https://www.4khd.com")
    }

    originFromUrl(url) {
        return /^https?:\/\/[^/]+/i.exec(url)?.[0] ?? this.siteUrl.replace(/\/$/, "")
    }

    queryValue(fullUrl, name) {
        const match = new RegExp(`[?&]${name}=([^&#]+)`).exec(fullUrl ?? "")
        return match?.[1] ?? ""
    }

    absoluteUrl(url, base = this.siteUrl) {
        if (!url) return ""
        const raw = String(url).trim()
        const normalizedBase = this.normalizeHost(base || this.siteUrl)
        if (raw.startsWith("//")) return "https:" + raw
        if (raw.startsWith("http://") || raw.startsWith("https://")) return this.normalizeHost(raw)
        if (raw.startsWith("?")) {
            const baseNoHash = normalizedBase.split("#")[0]
            const basePath = baseNoHash.split("?")[0]
            let result = basePath + raw
            // WordPress block pagination sometimes emits only ?query-N-page=2.
            // When current page is a search page, preserve s=keyword explicitly.
            const searchValue = this.queryValue(baseNoHash, "s")
            if (searchValue && !/[?&]s=/.test(raw)) {
                result += `${result.includes("?") ? "&" : "?"}s=${searchValue}`
            }
            return this.normalizeHost(result)
        }
        if (raw.startsWith("/")) return this.originFromUrl(normalizedBase).replace(/\/$/, "") + raw
        const baseDir = normalizedBase.endsWith("/") ? normalizedBase : normalizedBase.replace(/\/[^/]*$/, "/")
        return this.normalizeHost(baseDir + raw)
    }

    pathWithQueryFromUrl(url) {
        const full = this.absoluteUrl(url)
        const withoutHash = full.split("#")[0]
        return withoutHash.replace(/^https?:\/\/[^/]+/i, "") || "/"
    }

    async getDocument(path) {
        const fullUrl = this.absoluteUrl(path)
        const response = await Network.get(fullUrl, this.headers)
        if (response.status >= 400) {
            throw `SZZS / 4KHD HTTP ${response.status}: ${fullUrl}`
        }
        return new HtmlDocument(response.body)
    }

    normalizePage(page, fallback = 1) {
        const number = Number(page ?? fallback)
        return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback
    }

    appendQuery(path, name, value) {
        const separator = String(path).includes("?") ? "&" : "?"
        return `${path}${separator}${name}=${value}`
    }

    appendQueryPage(path, page, queryName = "query-3-page") {
        const currentPage = this.normalizePage(page, 1)
        if (currentPage <= 1) return path
        return this.appendQuery(path, queryName, currentPage)
    }

    searchBasePath(keyword) {
        return `/?s=${encodeURIComponent(keyword ?? "")}`
    }

    albumPath(id) {
        if (!id) return "/"
        if (id.startsWith("http://") || id.startsWith("https://")) return this.absoluteUrl(id)
        return "/" + String(id).replace(/^\/+/, "")
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
        const match = /^\/(content\/.+?\.html)(?:\/\d+)?\/?$/.exec(path)
        return match ? this.safeDecode(match[1]) : ""
    }

    normalizeImageUrl(raw) {
        const value = String(raw ?? "").trim()
        if (!value || value === "#" || value.startsWith("data:image/")) return ""

        let url = this.absoluteUrl(value)

        // 4KHD often serves images through WordPress image proxy:
        // https://i0.wp.com/pic.4khd.com/.../w1300-rw/image.webp?w=1300
        // The proxy is easy to hit 429 in Venera because thumbnails/read-ahead request many
        // images quickly. Use the real 4KHD CDN URL instead, matching the Full Picture Load rule.
        url = url.replace(/^https?:\/\/i\d+\.wp\.com\//i, "https://")
        url = url.replace(/^https?:\/\/i\d+\.wp\.com\?url=/i, "")
        try {
            url = decodeURIComponent(url)
        } catch (_) {}

        url = url.replace(/^https?:\/\/pic\.4khd\.com/i, "https://img.4khd.com")
        url = url.replace(/^https?:\/\/cdn\.4khd\.com/i, "https://img.4khd.com")
        url = url.replace(/\?.*$/, "")
        url = url.replace(/\/w\d+(?:-h\d+)?-rw\//i, "/w2500-h2500-rw/")

        return url
    }

    imageUrl(raw) {
        const url = this.normalizeImageUrl(raw)
        if (!url) return ""
        return /\.(jpe?g|png|webp|avif)(?:[?#].*)?$/i.test(url) ? url : ""
    }

    imageCandidates(raw) {
        const candidates = []
        const add = (url) => {
            if (url && !candidates.includes(url)) candidates.push(url)
        }

        const normalized = this.normalizeImageUrl(raw)
        add(normalized)

        // If the high quality CDN path is temporarily unavailable, fall back to smaller
        // direct CDN variants before ever falling back to the WordPress proxy.
        if (normalized) {
            add(normalized.replace("/w2500-h2500-rw/", "/w1300-rw/"))
            add(normalized.replace("/w2500-h2500-rw/", "/w800-rw/"))
            add(normalized.replace("https://img.4khd.com", "https://pic.4khd.com"))
        }

        const original = this.absoluteUrl(raw)
        if (original && !/^https?:\/\/i\d+\.wp\.com\//i.test(original)) {
            add(original)
        }

        return candidates.filter((url) => /\.(jpe?g|png|webp|avif)(?:[?#].*)?$/i.test(url))
    }

    imageLoadingConfig(raw, index = 0) {
        const candidates = this.imageCandidates(raw)
        const url = candidates[index] ?? candidates[0] ?? raw
        const headers = {
            ...this.imageHeaders,
            "Referer": "https://www.4khd.com/"
        }
        return {
            url,
            headers,
            onLoadFailed: index + 1 < candidates.length ? (() => this.imageLoadingConfig(raw, index + 1)) : null
        }
    }

    splitSrcset(value) {
        return String(value ?? "")
            .split(",")
            .map((part) => part.trim().split(/\s+/)[0])
            .filter((part) => part.length > 0)
    }

    firstImageUrl(root) {
        const image = root?.querySelector("img[data-src], img[data-lazy-src], img[src], img[srcset]")
        const candidates = [
            image?.attributes?.["data-lazy-src"],
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
        const match = /(\d+)\s*(?:photos?|pics?|p|枚|张|圖|图)/i.exec(text ?? "")
        return match ? Number(match[1]) : null
    }

    extractSize(text) {
        return /(\d+(?:\.\d+)?\s*(?:MB|GB))/i.exec(text ?? "")?.[1] ?? ""
    }

    classList(node) {
        return Array.from(node?.classNames ?? node?.classes ?? [])
    }

    categoriesFromClasses(root) {
        return this.catalogCollect(root).filter(e=>e.ns==="Category").map(e=>e.label)
    }

    nearestPostItem(element) {
        let current = element
        for (let depth = 0; depth < 8 && current; depth++) {
            const className = this.classList(current).join(" ")
            if (current.localName === "li" || className.includes("post")) return current
            current = current.parent
        }
        return element
    }

    listingItems(doc) {
        const items = doc.querySelectorAll("li.wp-block-post, .wp-block-post-template > li, article")
            .filter((item) => item.querySelector("a[href*='/content/']"))
        if (items.length) return items
        return doc.querySelectorAll("a[href*='/content/']")
            .map((link) => this.nearestPostItem(link))
    }

    parseAlbumList(doc) {
        const seen = {}
        const comics = []
        for (const item of this.listingItems(doc)) {
            const link = item.querySelector(".wp-block-post-title a[href]") ??
                item.querySelector("h1 a[href*='/content/'], h2 a[href*='/content/'], h3 a[href*='/content/']") ??
                item.querySelector("a[href*='/content/']")
            const href = link?.attributes?.href ?? ""
            const id = this.extractAlbumId(href)
            if (!id || seen[id]) continue
            seen[id] = true
            const title = this.cleanText(link?.text || link?.attributes?.title || id)
            const text = this.cleanText(item.text)
            comics.push({
                id,
                title: title || id,
                subtitle: this.extractSize(`${title} ${text}`) || "4KHD",
                cover: this.firstImageUrl(item),
                tags: this.categoriesFromClasses(item),
                description: this.absoluteUrl(href),
                maxPage: this.extractImageCount(`${title} ${text}`),
                language: "image"
            })
        }
        return comics
    }

    pageNumberFromHref(href) {
        const value = href ?? ""
        return Number(
            /[?&]query-\d+-page=(\d+)/.exec(value)?.[1] ??
            /[?&]paged=(\d+)/.exec(value)?.[1] ??
            /\/page\/(\d+)\/?/i.exec(value)?.[1] ??
            "0"
        )
    }

    pageNumberFromLink(link) {
        const href = link?.attributes?.href ?? ""
        const hrefPage = this.pageNumberFromHref(href)
        if (hrefPage > 0) return hrefPage
        const label = this.cleanText(`${link?.text ?? ""} ${link?.attributes?.["aria-label"] ?? ""} ${link?.attributes?.title ?? ""}`)
        return Number(/(?:page\s*)?(\d+)/i.exec(label)?.[1] ?? "0")
    }

    paginationLinks(doc) {
        return doc.querySelectorAll("a[href]")
            .filter((link) => {
                const href = link.attributes.href ?? ""
                return /query-\d+-page=\d+/.test(href) || /[?&]paged=\d+/.test(href) || /\/page\/\d+/i.test(href) || /^\d+$/.test(this.cleanText(link.text))
            })
    }

    parseMaxPage(doc) {
        let maxPage = 1
        for (const link of this.paginationLinks(doc)) {
            const page = this.pageNumberFromLink(link)
            if (page > maxPage) maxPage = page
        }
        return maxPage
    }

    findPagePath(doc, currentPath, page) {
        const currentPage = this.normalizePage(page, 1)
        if (currentPage <= 1) return currentPath
        for (const link of this.paginationLinks(doc)) {
            if (this.pageNumberFromLink(link) === currentPage) {
                return this.pathWithQueryFromUrl(this.absoluteUrl(link.attributes.href, this.absoluteUrl(currentPath)))
            }
        }
        return ""
    }

    detectedQueryPageName(doc) {
        for (const link of doc.querySelectorAll("a[href*='query-'][href*='-page=']")) {
            const match = /[?&](query-\d+-page)=\d+/.exec(link.attributes.href ?? "")
            if (match) return match[1]
        }
        return "query-3-page"
    }

    fallbackPagedPath(currentPath, firstDoc, page) {
        const currentPage = this.normalizePage(page, 1)
        if (currentPage <= 1) return currentPath
        const queryName = this.detectedQueryPageName(firstDoc)
        return this.appendQueryPage(currentPath, currentPage, queryName)
    }

    async loadPagedList(basePath, page) {
        const currentPage = this.normalizePage(page, 1)
        const firstDoc = await this.getDocument(basePath)
        try {
            if (currentPage <= 1) {
                return {
                    comics: this.parseAlbumList(firstDoc),
                    maxPage: this.parseMaxPage(firstDoc)
                }
            }
            const pagePath = this.findPagePath(firstDoc, basePath, currentPage) || this.fallbackPagedPath(basePath, firstDoc, currentPage)
            const pageDoc = await this.getDocument(pagePath)
            try {
                return {
                    comics: this.parseAlbumList(pageDoc),
                    maxPage: Math.max(this.parseMaxPage(firstDoc), this.parseMaxPage(pageDoc), currentPage)
                }
            } finally {
                pageDoc.dispose()
            }
        } finally {
            firstDoc.dispose()
        }
    }

    contentRoot(doc) {
        return doc.querySelector("article .entry-content") ??
            doc.querySelector("article .wp-block-post-content") ??
            doc.querySelector(".entry-content") ??
            doc.querySelector(".wp-block-post-content") ??
            doc.querySelector("article") ??
            doc.querySelector("main") ??
            doc.body
    }

    imageInsideOtherAlbumLink(image, id) {
        let current = image
        for (let depth = 0; depth < 8 && current; depth++) {
            if (current.localName === "a") {
                const albumId = this.extractAlbumId(current.attributes?.href ?? "")
                if (albumId && albumId !== id) return true
            }
            current = current.parent
        }
        return false
    }

    extractDetailImages(root, id) {
        const images = []
        const seen = {}
        const add = (url) => {
            if (!url || seen[url]) return
            seen[url] = true
            images.push(url)
        }
        for (const image of root.querySelectorAll("img[src], img[data-src], img[data-original], img[data-lazy-src], img[srcset]")) {
            if (id && this.imageInsideOtherAlbumLink(image, id)) continue
            const candidates = [
                image.attributes["data-original"],
                image.attributes["data-lazy-src"],
                image.attributes["data-src"],
                image.attributes.src,
                ...this.splitSrcset(image.attributes.srcset)
            ]
            for (const candidate of candidates) add(this.imageUrl(candidate))
        }
        for (const source of root.querySelectorAll("source[srcset]")) {
            for (const candidate of this.splitSrcset(source.attributes.srcset)) add(this.imageUrl(candidate))
        }
        return images
    }

    detailPagePaths(doc, id) {
        const paths = []
        const seen = {}
        for (const link of doc.querySelectorAll("a[href]")) {
            const href = link.attributes.href ?? ""
            const textPage = Number(this.cleanText(link.text))
            if (!textPage || textPage <= 1) continue
            if (this.extractAlbumId(href) === id) {
                const pagePath = this.pathWithQueryFromUrl(this.absoluteUrl(href))
                if (!seen[pagePath]) {
                    seen[pagePath] = true
                    paths.push(pagePath)
                }
            }
        }
        return paths
    }

    parseDetail(doc, id) {
        const normalizedId = this.extractAlbumId(id) || id
        const root = this.contentRoot(doc)
        const title = this.cleanText(root.querySelector(".wp-block-post-title, h1, h2, h3")?.text ||
            doc.querySelector("meta[property='og:title']")?.attributes?.content ||
            normalizedId)
        const documentText = this.cleanText(doc.body?.text)
        const images = this.extractDetailImages(root, normalizedId)
        const imageCount = this.extractImageCount(`${title} ${documentText}`) ?? images.length
        return {
            title,
            subtitle: this.extractSize(`${title} ${documentText}`),
            cover: images[0] ?? this.firstImageUrl(root),
            description: doc.querySelector("meta[property='og:description']")?.attributes?.content ?? this.extractSize(`${title} ${documentText}`),
            tags: {
                "category": this.categoriesFromClasses(root),
                "source": ["SZZS / 4KHD"]
            },
            chapters: {
                "main": "Photos"
            },
            thumbnails: images,
            uploadTime: doc.querySelector("meta[property='article:published_time']")?.attributes?.content ?? "",
            updateTime: doc.querySelector("meta[property='article:modified_time']")?.attributes?.content ?? "",
            uploader: "SZZS / 4KHD",
            url: this.absoluteUrl(this.albumPath(normalizedId)),
            maxPage: imageCount,
            stars: null
        }
    }

    explore = [
        {
            title: "SZZS / 4KHD Latest",
            type: "multiPageComicList",
            load: async (page) => {
                return await this.loadPagedList("/", page)
            }
        }
    ]

    search = {
        load: async (keyword, options, page) => {
            return await this.loadPagedList(this.searchBasePath(keyword), page)
        }
    }

    category = {
        title: "4KHD Categories",
        parts: [
            {
                name: "Category",
                type: "fixed",
                itemType: "category",
                categories: ["content", "twitter", "cosplay", "写真"],
                categoryParams: ["/", "/?s=twitter", "/?s=cosplay", "/?s=%E5%86%99%E7%9C%9F"]
            }
        ],
        enableRankingPage: false
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            return await this.loadPagedList(param || "/", page)
        }
    }

    comic = {
        idMatch: "^content/.+\\.html$",
        loadInfo: async (id) => {
            const doc = await this.getDocument(this.albumPath(id))
            try {
                const normalizedId = this.extractAlbumId(id) || id
                const detail = this.parseDetail(doc, normalizedId)
                const allImages = [...detail.thumbnails]
                for (const path of this.detailPagePaths(doc, normalizedId)) {
                    const pageDoc = await this.getDocument(path)
                    try {
                        for (const image of this.parseDetail(pageDoc, normalizedId).thumbnails) {
                            if (!allImages.includes(image)) allImages.push(image)
                        }
                    } finally {
                        pageDoc.dispose()
                    }
                }
                detail.thumbnails = allImages
                detail.maxPage = Math.max(detail.maxPage ?? 0, allImages.length)
                this.detailCache[normalizedId] = detail
                this.detailCache[id] = detail
                return detail
            } finally {
                doc.dispose()
            }
        },
        loadEp: async (id, ep) => {
            const normalizedId = this.extractAlbumId(id) || id
            const cachedImages = this.detailCache[normalizedId]?.thumbnails ?? this.detailCache[id]?.thumbnails
            if (cachedImages?.length) return { images: cachedImages }
            const detail = await this.comic.loadInfo(normalizedId)
            return { images: detail.thumbnails }
        },
        onImageLoad: async (imageKey, id, ep) => {
            return this.imageLoadingConfig(imageKey)
        },
        onThumbnailLoad: (imageKey) => {
            const url = this.imageCandidates(imageKey)[0] ?? this.normalizeImageUrl(imageKey) ?? imageKey
            return {
                url,
                headers: this.imageHeaders
            }
        },
        link: {
            domains: ["www.4khd.com", "4khd.com", "szzs.uuss.uk"],
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

