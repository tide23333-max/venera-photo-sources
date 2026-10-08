class PhotoDeckDanryokuSource extends ComicSource {
    name = "DANRYOKU"

    key = "photo_deck_danryoku"

    version = "0.1.6"

    minAppVersion = "1.17.0"

    siteUrl = "https://danryoku.com/"
    url = "https://raw.githubusercontent.com/tide23333-max/venera-photo-sources/main/scripts/DANRYOKU.js"

    headers = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja-JP,ja;q=0.9,zh-CN;q=0.8,zh;q=0.7,en-US;q=0.6,en;q=0.5",
        "Referer": "https://danryoku.com/"
    }

    imageHeaders = {
        "User-Agent": this.headers["User-Agent"],
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": this.headers["Accept-Language"],
        "Referer": "https://danryoku.com/"
    }

    apiHeaders = {
        "User-Agent": this.headers["User-Agent"],
        "Accept": "application/json,text/plain,*/*",
        "Accept-Language": this.headers["Accept-Language"],
        "Referer": "https://danryoku.com/"
    }

    detailCache = {}

    listMetaCache = {}

    tagPathMap = {}

    cleanText(text) {
        return String(text ?? "").replace(/\s+/g, " ").trim()
    }

    stripHtml(text) {
        return this.cleanText(String(text ?? "")
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&#8211;|&#8212;/g, "-")
            .replace(/&#8217;/g, "'")
            .replace(/&quot;/g, '"'))
    }

    headerValue(headers, key) {
        const target = String(key ?? "").toLowerCase()
        for (const name in headers ?? {}) {
            if (String(name).toLowerCase() === target) return headers[name]
        }
        return null
    }

    isBadMetaLabel(text) {
        const value = this.cleanText(text)
        if (!value) return true
        return /^(HOME|MENU|RANDOM|CONTACT|COUNTRY|CATEGORY|CATEGORIES|MODEL|MODELS|TYPE|SOURCE|DANRYOKU)$/i.test(value)
    }

    isCountryLabel(text) {
        return /^(Japan|China|Korea|Taiwan|Western)$/i.test(this.cleanText(text))
    }

    isTypeLabel(text) {
        const value = this.cleanText(text)
        return /^(NSFW|COSPLAY|Cosplay|Photobook|PhotoBook|Private Photoshoot|MetArt|Graphis|FRIDAY|WPB|YS|JP)$/i.test(value)
    }

    modelSearchKeyword(text) {
        const raw = this.cleanText(text)
        if (!raw) return raw
        const cjkRuns = raw.match(/[\u3040-\u30ff\u3400-\u9fff々ヶー]+/g) ?? []
        if (cjkRuns.length) {
            let best = cjkRuns.sort((a, b) => b.length - a.length)[0]
            // For Japanese repetition mark names such as 志田音々, the shorter 志田音 search catches more title variants.
            best = best.replace(/々/g, "")
            if (best.length >= 2) return best
        }
        return raw.replace(/^Coser@/i, "").replace(/^Cosplay\s+/i, "").trim()
    }

    safeDecode(value) {
        try {
            return decodeURIComponent(value)
        } catch (_) {
            return value
        }
    }

    safeEncode(value) {
        try {
            return encodeURIComponent(this.safeDecode(value))
        } catch (_) {
            return encodeURIComponent(String(value ?? ""))
        }
    }

    encodePath(path) {
        return String(path ?? "")
            .replace(/^\/+|\/+$/g, "")
            .split("/")
            .filter((part) => part.length > 0)
            .map((part) => this.safeEncode(part))
            .join("/")
    }

    absoluteUrl(url, base = this.siteUrl) {
        if (!url) return ""
        const value = String(url).trim()
        if (!value || value === "#") return ""
        if (value.startsWith("http://") || value.startsWith("https://")) return value
        if (value.startsWith("//")) return "https:" + value
        const root = base.replace(/\/$/, "")
        if (value.startsWith("/")) return root + value
        if (value.startsWith("?")) return root + "/" + value
        return root + "/" + value
    }

    async getDocument(path) {
        const response = await Network.get(this.absoluteUrl(path), this.headers)
        if (response.status >= 400) {
            throw `DANRYOKU HTTP ${response.status}: ${path}`
        }
        return new HtmlDocument(response.body)
    }

    emptyListResult() {
        return {
            comics: [],
            maxPage: 1
        }
    }

    uniqueValues(values) {
        const result = []
        const seen = {}
        for (const value of values ?? []) {
            const text = this.cleanText(value)
            if (!text || seen[text]) continue
            seen[text] = true
            result.push(text)
        }
        return result
    }

    albumPath(id) {
        if (!id) return "/"
        const value = String(id)
        if (value.startsWith("http://") || value.startsWith("https://")) {
            return this.pathFromUrl(value)
        }
        return "/" + this.encodePath(value) + "/"
    }

    pathFromUrl(url) {
        const full = this.absoluteUrl(url)
        const withoutHash = full.split("#")[0]
        const withoutQuery = withoutHash.split("?")[0]
        return withoutQuery.replace(/^https?:\/\/[^/]+/i, "") || "/"
    }

    appendPage(path, page) {
        const currentPage = Number(page ?? 1)
        if (!currentPage || currentPage <= 1) return path || "/"
        const clean = String(path || "/").replace(/\/$/g, "")
        if (!clean || clean === "/") return `/page/${currentPage}/`
        return `${clean}/page/${currentPage}/`
    }

    searchPath(keyword, page) {
        const encoded = encodeURIComponent(keyword ?? "")
        if (!encoded) return ""
        const currentPage = Number(page ?? 1)
        return currentPage > 1 ? `/page/${currentPage}/?s=${encoded}` : `/?s=${encoded}`
    }

    extractAlbumId(href) {
        if (!href) return ""
        const path = this.pathFromUrl(href)
            .replace(/^\/+|\/+$/g, "")
            .replace(/\/page\/\d+$/g, "")
            .replace(/\/\d+$/g, "")
        if (!path) return ""
        if (/^(category|tag|page|search|feed|comments|author|random|contact|about|wp-json|wp-content|wp-includes|wp-admin)(\/|$)/i.test(path)) return ""
        if (/\.(?:css|js|xml|json|ico|png|jpe?g|jpeg|webp|gif|svg|zip|rar|7z)$/i.test(path)) return ""
        return this.safeDecode(path)
    }

    isDanryokuImage(url) {
        return /^https?:\/\/(?:img\.)?danryoku\.com\//i.test(url)
    }

    imageUrl(raw) {
        if (!raw) return ""
        const value = String(raw).trim()
        if (!value || value === "#" || value.startsWith("data:image/")) return ""
        const url = this.absoluteUrl(value)
        if (!this.isDanryokuImage(url)) return ""
        return /\.(?:jpe?g|jpeg|png|webp)(?:\?.*)?$/i.test(url) ? url : ""
    }

    splitSrcset(value) {
        return String(value ?? "")
            .split(",")
            .map((part) => part.trim().split(/\s+/)[0])
            .filter((part) => part.length > 0)
    }

    firstImageUrl(root) {
        const image = root?.querySelector?.("img[data-original], img[data-lazy-src], img[data-src], img[src], img[srcset]")
        const candidates = [
            image?.attributes?.["data-original"],
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

    imageCandidates(image) {
        const attrs = image?.attributes ?? {}
        return [
            attrs["data-original"],
            attrs["data-lazy-src"],
            attrs["data-src"],
            attrs.src,
            ...this.splitSrcset(attrs.srcset)
        ]
    }

    extractImageCount(text) {
        const match = /(\d+)\s*(?:枚|画像|photos?|pics?|images?|P)\b/i.exec(text ?? "")
        return match ? Number(match[1]) : null
    }

    rememberTagPath(namespace, tag, href) {
        const name = this.cleanText(namespace || "tag")
        let value = this.cleanText(tag)
        if (!value || !href) return value
        const path = this.pathFromUrl(href)
        if (!path || path === "/") return value
        value = this.catalogRemember(path.includes("/category/country/") ? "Country" : path.includes("/category/") ? "Type" : name, value, href)
        this.tagPathMap[`${name}:${value}`] = path
        this.tagPathMap[value] = path
        return value
    }

    categoryPathFor(label) {
        const text = this.cleanText(label)
        const builtIn = {
            "All": "/",
            "DANRYOKU": "/",
            "NSFW": "/category/nsfw/",
            "COSPLAY": "/category/cosplay/",
            "Cosplay": "/category/cosplay/",
            "Japan": "/category/country/japan/",
            "JP": "/category/country/japan/",
            "China": "/category/country/china/",
            "Korea": "/category/country/korea/",
            "Taiwan": "/category/country/taiwan/",
            "Western": "/category/country/western/"
        }
        if (builtIn[text]) return builtIn[text]
        if (this.tagPathMap[text]) return this.tagPathMap[text]
        return ""
    }

    tagPathFor(label) {
        const text = this.cleanText(label)
        if (!text) return ""
        if (this.tagPathMap[`Model:${text}`]) return this.tagPathMap[`Model:${text}`]
        if (this.tagPathMap[text]) return this.tagPathMap[text]
        return ""
    }

    linkValuesByPath(root, rules, namespace) {
        const values = []
        for (const link of root?.querySelectorAll?.("a[href]") ?? []) {
            if (this.catalogExcluded(link)) continue
            const href = link.attributes?.href ?? ""
            const path = this.pathFromUrl(href)
            let matched = false
            for (const rule of rules) {
                if (path.includes(rule)) {
                    matched = true
                    break
                }
            }
            if (!matched) continue
            const text = this.cleanText(link.text || link.attributes?.title)
            if (this.isBadMetaLabel(text)) continue
            values.push(this.rememberTagPath(namespace, text, href))
        }
        return this.uniqueValues(values)
    }

    categoryLabels(root) {
        return this.linkValuesByPath(root, ["/category/"], "Category")
    }

    tagLabels(root) {
        return this.linkValuesByPath(root, ["/tag/"], "Model")
    }

    pageContext(doc) {
        const h1 = this.cleanText(doc.querySelector("h1")?.text)
        if (!h1) return ""
        if (/^search/i.test(h1)) return ""
        if (/^danryoku$/i.test(h1)) return ""
        return h1
    }

    nearestArticle(element) {
        let current = element
        for (let depth = 0; depth < 8 && current; depth++) {
            const className = Array.from(current.classes ?? []).join(" ")
            if (current.localName === "article" || /\b(post|hentry|entry)\b/i.test(className)) return current
            current = current.parent
        }
        return element
    }

    listingArticles(doc) {
        const articles = doc.querySelectorAll("article, .post, .hentry")
            .filter((article) => article.querySelector("a[href]"))
        if (articles.length) return articles
        return doc.querySelectorAll("h2 a[href], h3 a[href], .entry-title a[href], .post-title a[href]")
            .map((link) => this.nearestArticle(link))
    }

    primaryPostLink(article) {
        return article.querySelector("h2 a[href]") ??
            article.querySelector("h3 a[href]") ??
            article.querySelector(".entry-title a[href]") ??
            article.querySelector(".post-title a[href]") ??
            article.querySelector("a[href]")
    }

    titleMeta(title, context) {
        const result = { type: "", model: "", country: "", tags: [] }
        const raw = this.cleanText(title)
        const beforeDash = this.cleanText(raw.split(/\s+[–—-]\s+/)[0] || raw)
        let left = beforeDash

        const prefixRules = [
            [/^Coser@\s*/i, "Coser"],
            [/^Coser\s+/i, "Coser"],
            [/^Cosplay\s+/i, "Cosplay"],
            [/^JP\s+/i, "JP"],
            [/^Japan\s+/i, "Japan"],
            [/^Private\s+Photoshoot\s+/i, "Private Photoshoot"],
            [/^MetArt\s+/i, "MetArt"],
            [/^Graphis\s+/i, "Graphis"],
            [/^YS\s+/i, "YS"],
            [/^FRIDAY\s+/i, "FRIDAY"],
            [/^WPB\s+/i, "WPB"]
        ]
        for (const rule of prefixRules) {
            if (rule[0].test(left)) {
                result.type = rule[1]
                left = this.cleanText(left.replace(rule[0], ""))
                break
            }
        }

        if (!result.type && /cosplay/i.test(raw)) result.type = "Cosplay"
        if (/^(JP|Japan)$/i.test(result.type)) result.country = "Japan"
        if (/China|Chinese|Xiuren|XiuRen|秀人|模特/i.test(raw)) result.country = result.country || "China"
        if (/Korea|Korean/i.test(raw)) result.country = result.country || "Korea"
        if (/Taiwan|Taiwanese/i.test(raw)) result.country = result.country || "Taiwan"
        if (/MetArt|Western/i.test(raw)) result.country = result.country || "Western"

        result.model = this.cleanText(left.replace(/^[@\s]+/, ""))
        if (result.model.length > 40) result.model = ""

        const tags = []
        if (context && !/^page\s/i.test(context)) tags.push(context)
        if (result.type) tags.push(result.type)
        if (result.country) tags.push(result.country)
        if (result.model) tags.push(result.model)
        result.tags = this.uniqueValues(tags)
        return result
    }

    normalizeTitleForMatch(text) {
        return this.cleanText(text)
            .toLowerCase()
            .replace(/[\[\]【】()（）「」『』《》_@\-–—｜|:：,，.。!！?？\s]+/g, "")
    }

    imageLooksLikeCurrent(image, title) {
        const attrs = image?.attributes ?? {}
        const alt = this.normalizeTitleForMatch(`${attrs.alt ?? ""} ${attrs.title ?? ""}`)
        const name = this.normalizeTitleForMatch(title)
        if (!name || !alt) return false
        return alt.includes(name) || name.includes(alt)
    }

    parseAlbumList(doc) {
        const seen = {}
        const comics = []
        const context = this.pageContext(doc)
        for (const article of this.listingArticles(doc)) {
            const link = this.primaryPostLink(article)
            const href = link?.attributes?.href ?? ""
            const id = this.extractAlbumId(href)
            if (!id || seen[id]) continue
            seen[id] = true

            const title = this.cleanText(link?.attributes?.title || link?.text || article.querySelector("h2, h3")?.text || id)
            if (!title || /^older posts|next|previous|random|home$/i.test(title)) continue

            const titleMeta = this.titleMeta(title, context)
            const categories = this.categoryLabels(article)
            const modelTags = this.tagLabels(article)
            const tags = this.uniqueValues([...categories, ...modelTags, ...titleMeta.tags])
            const model = modelTags[0] || titleMeta.model || (context && !this.categoryPathFor(context) ? context : "")
            const text = this.cleanText(article.text)
            const cover = this.firstImageUrl(article)
            const time = this.cleanText(article.querySelector("time, .posted-on, .post-date, .entry-date")?.text)
            const subtitleParts = []
            if (model) subtitleParts.push(model)
            else if (titleMeta.type) subtitleParts.push(titleMeta.type)
            if (time) subtitleParts.push(time)

            const comic = {
                id,
                title,
                subtitle: subtitleParts.join(" · ") || context || "DANRYOKU",
                cover,
                tags,
                // Do not guess page count on list pages. DANRYOKU titles may contain [1P]/[74P]
                // that do not reliably equal the real gallery image count. Accurate counts are set in loadInfo.
                description: tags.length ? tags.slice(0, 3).join(" · ") : "DANRYOKU",
                language: "image"
            }
            comics.push(comic)
        }
        return comics
    }

    parseMaxPage(doc) {
        let maxPage = 1
        for (const link of doc.querySelectorAll("a[href*='/page/']")) {
            const match = /\/page\/(\d+)\//.exec(link.attributes.href ?? "")
            const page = Number(match?.[1] ?? "0")
            if (page > maxPage) maxPage = page
        }
        return maxPage
    }

    async enrichComicCard(comic) {
        if (!comic || !comic.id) return comic
        if (this.listMetaCache[comic.id]) return Object.assign(comic, this.listMetaCache[comic.id])
        let doc = null
        try {
            doc = await this.getDocument(this.albumPath(comic.id))
            const detail = this.parseDetail(doc, comic.id)
            const allTags = this.uniqueValues([
                ...(comic.tags ?? []),
                ...((detail.tags?.Category) ?? []),
                ...((detail.tags?.Model) ?? []),
                ...((detail.tags?.Country) ?? []),
                ...((detail.tags?.Source) ?? [])
            ])
            const meta = {
                subtitle: detail.subtitle || comic.subtitle,
                description: detail.maxPage ? `${detail.maxPage}P` : comic.description,
                maxPage: detail.maxPage || comic.maxPage,
                tags: allTags.length ? allTags : comic.tags,
                cover: comic.cover || detail.cover
            }
            this.listMetaCache[comic.id] = meta
            return Object.assign(comic, meta)
        } catch (_) {
            return comic
        } finally {
            if (doc) doc.dispose()
        }
    }

    async enrichComicCards(comics) {
        const result = []
        for (const comic of comics) {
            result.push(await this.enrichComicCard(comic))
        }
        return result
    }

    async loadComicList(path, emptyOnError = false, enrich = false) {
        let doc = null
        try {
            doc = await this.getDocument(path)
            const comics = this.parseAlbumList(doc)
            return {
                comics: enrich ? await this.enrichComicCards(comics) : comics,
                maxPage: this.parseMaxPage(doc)
            }
        } catch (error) {
            if (emptyOnError) return this.emptyListResult()
            throw error
        } finally {
            if (doc) doc.dispose()
        }
    }

    async getJson(path) {
        const response = await Network.get(this.absoluteUrl(path), this.apiHeaders)
        if (response.status >= 400) throw `DANRYOKU API HTTP ${response.status}: ${path}`
        const body = JSON.parse(response.body)
        return { body, headers: response.headers ?? {} }
    }

    restCover(post) {
        const embedded = post?._embedded ?? {}
        const medias = embedded["wp:featuredmedia"] ?? []
        for (const media of medias) {
            const url = this.imageUrl(media?.source_url)
            if (url) return url
            const sizes = media?.media_details?.sizes ?? {}
            for (const key in sizes) {
                const sized = this.imageUrl(sizes[key]?.source_url)
                if (sized) return sized
            }
        }
        return ""
    }

    restPostToComic(post, context = "") {
        const link = post?.link ?? post?.url ?? ""
        const id = this.extractAlbumId(link)
        if (!id) return null
        const title = this.stripHtml(post?.title?.rendered ?? post?.title ?? "") || id
        const titleMeta = this.titleMeta(title, context)
        const tags = this.uniqueValues([...titleMeta.tags])
        return {
            id,
            title,
            subtitle: titleMeta.model || titleMeta.type || context || "DANRYOKU",
            cover: this.restCover(post),
            tags,
            description: tags.length ? tags.slice(0, 3).join(" · ") : "DANRYOKU",
            language: "image"
        }
    }

    async restSearch(keyword, page) {
        const currentPage = Math.max(1, Number(page ?? 1))
        const key = encodeURIComponent(this.cleanText(keyword))
        if (!key) return this.emptyListResult()
        const path = `/wp-json/wp/v2/posts?search=${key}&page=${currentPage}&per_page=20&orderby=relevance&_embed=wp:featuredmedia&_fields=id,link,title,date,excerpt,_embedded`
        const data = await this.getJson(path)
        if (!Array.isArray(data.body)) return this.emptyListResult()
        const comics = []
        const seen = {}
        for (const post of data.body) {
            const comic = this.restPostToComic(post, this.cleanText(keyword))
            if (!comic || seen[comic.id]) continue
            seen[comic.id] = true
            comics.push(comic)
        }
        const totalPages = Number(this.headerValue(data.headers, "x-wp-totalpages") ?? 0)
        return {
            comics,
            maxPage: totalPages > 0 ? totalPages : (comics.length ? currentPage + 1 : currentPage)
        }
    }

    filterComics(comics, keyword) {
        const needle = this.cleanText(keyword).toLowerCase()
        if (!needle) return []
        const result = []
        const seen = {}
        for (const comic of comics) {
            const haystack = `${comic.title} ${comic.subtitle} ${comic.description} ${(comic.tags ?? []).join(" ")}`.toLowerCase()
            if (haystack.includes(needle) && !seen[comic.id]) {
                seen[comic.id] = true
                result.push(comic)
            }
        }
        return result
    }

    async fallbackSearch(keyword, page) {
        const currentPage = Math.max(1, Number(page ?? 1))
        const start = (currentPage - 1) * 3 + 1
        const paths = []
        for (let i = 0; i < 3; i++) {
            const p = start + i
            paths.push(p <= 1 ? "/" : `/page/${p}/`)
        }

        const comics = []
        for (const path of paths) {
            let doc = null
            try {
                doc = await this.getDocument(path)
                for (const comic of this.filterComics(this.parseAlbumList(doc), keyword)) {
                    if (!comics.some((item) => item.id === comic.id)) comics.push(comic)
                }
            } catch (_) {
                // fallback search should never break global or single-source search
            } finally {
                if (doc) doc.dispose()
            }
        }

        return {
            comics,
            maxPage: comics.length ? currentPage + 1 : currentPage
        }
    }

    detailImageAddFromImage(images, seen, image, preferHref = true) {
        const add = (raw) => {
            const url = this.imageUrl(raw)
            if (!url || seen[url]) return
            seen[url] = true
            images.push(url)
        }
        const parent = image?.parent
        if (preferHref && parent?.localName === "a") add(parent.attributes?.href)
        for (const candidate of this.imageCandidates(image)) add(candidate)
    }

    extractDetailImages(root, id, title = "") {
        const images = []
        const seen = {}
        const allImages = root.querySelectorAll("img[data-original], img[data-lazy-src], img[data-src], img[src], img[srcset]")

        // Main gallery images normally use the current post title as alt/title. Read them first;
        // this avoids pulling Related Model / Related Category thumbnails into the reader.
        for (const image of allImages) {
            if (this.imageLooksLikeCurrent(image, title)) this.detailImageAddFromImage(images, seen, image)
        }
        if (images.length >= 3) return images

        for (const link of root.querySelectorAll("a[href]")) {
            const href = link.attributes?.href
            const url = this.imageUrl(href)
            if (!url || seen[url]) continue
            seen[url] = true
            images.push(url)
        }
        if (images.length) return images

        for (const image of allImages) this.detailImageAddFromImage(images, seen, image, false)
        return images
    }

    detailPagePaths(doc, id) {
        const paths = []
        const seen = {}
        const normalizedId = this.extractAlbumId(id) || this.safeDecode(String(id ?? ""))
        for (const link of doc.querySelectorAll("a[href]")) {
            const href = link.attributes.href ?? ""
            const linkedId = this.extractAlbumId(href)
            const page = Number(/\/(\d+)\/?$/.exec(this.pathFromUrl(href))?.[1] ?? "0")
            if (linkedId === normalizedId && page > 1 && !seen[href]) {
                seen[href] = true
                paths.push(this.pathFromUrl(href))
            }
        }
        return paths
    }

    detailLinkedValue(root, titleText, namespace, pathRules) {
        const normalizedTitle = this.cleanText(titleText).replace(/：$/, ":")
        for (const heading of root.querySelectorAll("h1, h2, h3, h4, strong, b, p")) {
            const text = this.cleanText(heading.text)
            if (!text || !text.toLowerCase().includes(normalizedTitle.toLowerCase())) continue
            const values = this.linkValuesByPath(heading, pathRules, namespace)
            if (values.length) return values
        }
        return []
    }

    parseDetail(doc, id) {
        const root = doc.querySelector("article") ?? doc.body
        const normalizedId = this.extractAlbumId(id) || this.safeDecode(String(id ?? ""))
        const title = this.cleanText(root.querySelector("h1")?.text ||
            doc.querySelector("meta[property='og:title']")?.attributes?.content ||
            normalizedId)
        const description = this.cleanText(doc.querySelector("meta[name='description']")?.attributes?.content ||
            root.querySelector(".entry-summary, .summary, .entry-content p, p")?.text)
        const categories = this.categoryLabels(root)
        const tags = this.tagLabels(root)
        const modelValues = this.uniqueValues([
            ...this.detailLinkedValue(root, "Model name or Studio", "Model", ["/tag/"]),
            ...tags
        ])
        const rawCountryValues = this.uniqueValues([
            ...this.detailLinkedValue(root, "Model country", "Category", ["/category/"]),
            ...categories
        ]).filter((value) => !this.isBadMetaLabel(value))
        const titleMeta = this.titleMeta(title, rawCountryValues[0] ?? "")
        const models = (modelValues.length ? modelValues : (titleMeta.model ? [titleMeta.model] : []))
            .filter((value) => !this.isBadMetaLabel(value))
        const countries = this.uniqueValues([
            ...rawCountryValues.filter((value) => this.isCountryLabel(value)),
            titleMeta.country
        ].filter((value) => value && !this.isBadMetaLabel(value)))
        const typeTags = this.uniqueValues([
            titleMeta.type,
            ...categories.filter((value) => this.isTypeLabel(value) && !this.isCountryLabel(value))
        ].filter((value) => value && !this.isBadMetaLabel(value)))
        const images = this.extractDetailImages(root, normalizedId, title)
        const uploadTime = this.cleanText(root.querySelector("time, .posted-on, .post-date, .entry-date")?.text)
        const author = this.cleanText(root.querySelector(".author, .byline, .vcard")?.text) || "DANRYOKU"
        const imageCount = images.length

        const subtitle = models.length ? models.join(", ") : (countries.join(", ") || typeTags.join(", "))
        return {
            title,
            subtitle,
            cover: images[0] ?? this.firstImageUrl(root),
            description,
            tags: {
                "Model": models,
                "Country": countries,
                "Type": typeTags,
                "Source": ["DANRYOKU"]
            },
            chapters: {
                "main": "Photos"
            },
            thumbnails: images,
            uploadTime,
            updateTime: "",
            uploader: author,
            url: this.absoluteUrl(this.albumPath(normalizedId)),
            maxPage: imageCount,
            stars: null
        }
    }

    explore = [
        {
            title: "DANRYOKU Latest",
            type: "multiPageComicList",
            load: async (page) => {
                return this.loadComicList(page > 1 ? `/page/${page}/` : "/", false, false)
            }
        }
    ]

    search = {
        load: async (keyword, options, page) => {
            const normalized = this.cleanText(keyword)
            if (!normalized) return this.emptyListResult()

            // Fast path only: DANRYOKU's REST search can be much slower than the native search page
            // in Venera because it may wait for a long network timeout before falling back.
            const path = this.searchPath(normalized, page)
            if (!path) return this.emptyListResult()
            return this.loadComicList(path, true, false)
        }
    }

    category = {
        title: "DANRYOKU Categories",
        parts: [
            {
                name: "Type",
                type: "fixed",
                itemType: "category",
                categories: ["All", "NSFW", "COSPLAY", "Japan", "China", "Korea", "Taiwan", "Western"],
                categoryParams: ["/", "/category/nsfw/", "/category/cosplay/", "/category/country/japan/", "/category/country/china/", "/category/country/korea/", "/category/country/taiwan/", "/category/country/western/"]
            }
        ],
        enableRankingPage: false
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            const path = String(param || this.categoryPathFor(category) || "")
            if (path.startsWith("/")) {
                return this.loadComicList(this.appendPage(path, page ?? 1), false, false)
            }
            return this.search.load(category, options, page)
        }
    }

    comic = {
        idMatch: "^(?:https?://(?:www\\.)?danryoku\\.com/(?!category/|tag/|page/|search/|feed/|comments/|author/|random|contact|about|wp-)[^\\s?#]+/?|/(?!category/|tag/|page/|search/|feed/|comments/|author/|random|contact|about|wp-)[^\\s?#]+/|[^\\s?#/][^\\s?#]*)$",
        loadInfo: async (id) => {
            const normalizedId = this.extractAlbumId(id) || this.safeDecode(String(id ?? ""))
            const doc = await this.getDocument(this.albumPath(normalizedId))
            try {
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
            const normalizedId = this.extractAlbumId(id) || this.safeDecode(String(id ?? ""))
            const cachedImages = this.detailCache[normalizedId]?.thumbnails || this.detailCache[id]?.thumbnails
            if (cachedImages?.length) return { images: cachedImages }
            const detail = await this.comic.loadInfo(normalizedId)
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
        onClickTag: (namespace, tag) => {
            const name = this.cleanText(namespace)
            const value = this.cleanText(tag)
            if (!value) return { action: "search", keyword: tag }

            // Model tag click should be instant. Use the real /tag/ URL captured from the detail page.
            // Broad search may return more variants, but it is much slower and blocks the tag page for tens of seconds.
            if (name === "Model") {
                const modelPath = this.tagPathMap[`Model:${value}`] || this.tagPathMap[value] || this.tagPathFor(value)
                return {
                    action: "category",
                    keyword: value,
                    param: modelPath
                }
            }

            const path = this.categoryPathFor(value) || this.tagPathMap[`${name}:${value}`] || this.tagPathMap[value]
            if (path) {
                return {
                    action: "category",
                    keyword: value,
                    param: path
                }
            }
            return {
                action: "search",
                keyword: value
            }
        },
        link: {
            domains: ["danryoku.com", "www.danryoku.com"],
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

