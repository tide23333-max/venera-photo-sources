class PhotoDeckEveriaClubSource extends ComicSource {
    name = "Everia Club"

    key = "photo_deck_everia_club"

    version = "0.2.3"

    minAppVersion = "1.17.0"

    siteUrl = "https://www.everiaclub.com/"
    url = "https://raw.githubusercontent.com/tide23333-max/venera-photo-sources/main/scripts/everia_club.js"

    hosts = ["www.everiaclub.com", "everiaclub.com"]

    headers = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ja-JP;q=0.8,zh-CN;q=0.7",
        "Referer": "https://www.everiaclub.com/"
    }

    imageAccept = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"

    detailCache = {}

    webLoginStarted = false

    account = {
        loginWithWebview: {
            url: "https://www.everiaclub.com/",
            checkStatus: (url, title) => {
                const currentUrl = String(url ?? "")
                const currentTitle = String(title ?? "").toLowerCase()
                if (!/^https:\/\/(www\.)?everiaclub\.com\//i.test(currentUrl)) return false
                if (!currentTitle) return false
                if (currentTitle.includes("just a moment")) return false
                if (currentTitle.includes("attention required")) return false
                if (currentTitle.includes("cloudflare")) return false
                if (currentTitle.includes("403") || currentTitle.includes("forbidden")) return false
                this.webLoginStarted = true
                return true
            },
            onLoginSuccess: async () => {
                UI.showMessage("Everia Club session saved. Retry the source.")
            },
        },
        logout: () => {
            for (const host of this.hosts) Network.deleteCookies(`https://${host}/`)
            UI.showMessage("Everia Club session cleared.")
        },
        registerWebsite: null
    }

    settings = {
        sessionHint: {
            title: "Cloudflare note",
            type: "callback",
            buttonText: "Show note",
            callback: () => {
                UI.showMessage("If Everia Club shows Cloudflare, open source account settings, use Login with webview, complete verification, then retry.")
            }
        }
    }

    cleanText(text) {
        return String(text ?? "").replace(/\s+/g, " ").trim()
    }

    classList(node) {
        return Array.from(node?.classNames ?? node?.classes ?? [])
    }

    safeDecode(value) {
        try {
            return decodeURIComponent(value)
        } catch (_) {
            return value
        }
    }

    normalizeHost(url) {
        return String(url ?? "")
            .replace(/^http:\/\/everiaclub\.com/i, "https://www.everiaclub.com")
            .replace(/^https:\/\/everiaclub\.com/i, "https://www.everiaclub.com")
    }

    originFromUrl(url) {
        return /^https?:\/\/[^/]+/i.exec(String(url ?? ""))?.[0] ?? this.siteUrl.replace(/\/$/, "")
    }

    absoluteUrl(raw, base = this.siteUrl) {
        const value = String(raw ?? "").trim()
        if (!value || value === "#" || /^javascript:/i.test(value)) return ""
        const normalizedBase = this.normalizeHost(base || this.siteUrl)
        if (value.startsWith("//")) return this.normalizeHost("https:" + value)
        if (value.startsWith("http://") || value.startsWith("https://")) return this.normalizeHost(value)
        if (value.startsWith("?")) {
            const basePath = normalizedBase.split("#")[0].split("?")[0]
            return this.normalizeHost(basePath + value)
        }
        if (value.startsWith("/")) return this.originFromUrl(normalizedBase).replace(/\/$/, "") + value
        const baseDir = normalizedBase.endsWith("/") ? normalizedBase : normalizedBase.replace(/\/[^/]*$/, "/")
        return this.normalizeHost(baseDir + value)
    }

    stripHash(url) {
        return String(url ?? "").split("#")[0]
    }

    pathWithQueryFromUrl(url) {
        const full = this.stripHash(this.absoluteUrl(url))
        return full.replace(/^https?:\/\/[^/]+/i, "") || "/"
    }

    pathFromUrl(url) {
        return this.pathWithQueryFromUrl(url).split("?")[0] || "/"
    }

    normalizePage(page, fallback = 1) {
        const value = Number(page ?? fallback)
        return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
    }

    queryValue(pathOrUrl, key) {
        const value = String(pathOrUrl ?? "")
        return new RegExp(`[?&]${key}=([^&#]+)`, "i").exec(value)?.[1] ?? ""
    }

    appendQuery(path, key, value) {
        const cleanPath = String(path || "/")
        return `${cleanPath}${cleanPath.includes("?") ? "&" : "?"}${key}=${value}`
    }

    pagePath(path, page, param = "page") {
        const currentPage = this.normalizePage(page, 1)
        const base = path || "/"
        if (currentPage <= 1) return base
        return this.appendQuery(base, param, currentPage)
    }

    buildCookieHeader(url = this.siteUrl) {
        const parts = []
        const seen = {}
        for (const base of [this.siteUrl, url]) {
            for (const cookie of Network.getCookies(base) ?? []) {
                if (!cookie?.name || !cookie?.value || seen[cookie.name]) continue
                seen[cookie.name] = true
                parts.push(`${cookie.name}=${cookie.value}`)
            }
        }
        return parts.join("; ")
    }

    requestHeaders(target = this.siteUrl, referer = this.siteUrl) {
        const headers = {
            ...this.headers,
            "Referer": referer || this.siteUrl
        }
        const cookie = this.buildCookieHeader(target)
        if (cookie) headers["cookie"] = cookie
        return headers
    }

    imageHeadersFor(url, referer = this.siteUrl) {
        const headers = {
            "User-Agent": this.headers["User-Agent"],
            "Accept": this.imageAccept,
            "Referer": referer || this.siteUrl
        }
        const cookie = this.buildCookieHeader(url)
        if (cookie) headers["cookie"] = cookie
        return headers
    }

    isCloudflareChallenge(response) {
        const headers = response?.headers ?? {}
        const mitigated = String(headers["cf-mitigated"] ?? headers["Cf-Mitigated"] ?? headers["CF-Mitigated"] ?? "").toLowerCase()
        const body = String(response?.body ?? "").toLowerCase()
        return response?.status === 403 && (
            mitigated.includes("challenge") ||
            body.includes("challenge-platform") ||
            body.includes("window._cf_chl_opt") ||
            body.includes("cf-turnstile") ||
            body.includes("just a moment") ||
            body.includes("enable javascript and cookies") ||
            body.includes("verify you are human")
        )
    }

    async delay(milliseconds) {
        return new Promise((resolve) => setTimeout(resolve, milliseconds))
    }

    async getDocument(path, referer = this.siteUrl, retry = 1) {
        const target = this.absoluteUrl(path)
        let lastError = null
        for (let attempt = 0; attempt <= retry; attempt++) {
            try {
                const response = await Network.get(target, this.requestHeaders(target, referer))
                if (this.isCloudflareChallenge(response)) {
                    throw "Everia Club Cloudflare verification required. Open this source account settings and use Login with webview once, then retry."
                }
                if (response.status >= 400) {
                    throw `Everia Club HTTP ${response.status}: ${target}`
                }
                return new HtmlDocument(response.body)
            } catch (error) {
                lastError = error
                if (/HTTP (403|429)|verification required|Cloudflare/i.test(String(error))) throw error
                if (attempt < retry) await this.delay(500 + attempt * 500)
            }
        }
        throw lastError
    }


    async getText(path, referer = this.siteUrl, retry = 1) {
        const target = this.absoluteUrl(path)
        let lastError = null
        for (let attempt = 0; attempt <= retry; attempt++) {
            try {
                const response = await Network.get(target, this.requestHeaders(target, referer))
                if (this.isCloudflareChallenge(response)) {
                    throw "Everia Club Cloudflare verification required. Open this source account settings and use Login with webview once, then retry."
                }
                if (response.status >= 400) {
                    throw `Everia Club HTTP ${response.status}: ${target}`
                }
                return response
            } catch (error) {
                lastError = error
                if (attempt < retry) await this.delay(500 + attempt * 500)
            }
        }
        throw lastError
    }

    headerValue(headers, name) {
        const lower = String(name ?? "").toLowerCase()
        for (const key of Object.keys(headers ?? {})) {
            if (String(key).toLowerCase() === lower) return headers[key]
        }
        return ""
    }

    decodeHtml(text) {
        return String(text ?? "")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&#8211;|&#8212;/g, "-")
            .replace(/&#8216;|&#8217;/g, "'")
            .replace(/&#8220;|&#8221;/g, '"')
            .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    }

    stripHtml(text) {
        return this.cleanText(this.decodeHtml(String(text ?? "").replace(/<[^>]+>/g, " ")))
    }

    valueFromApiTitle(item) {
        return this.stripHtml(item?.title?.rendered ?? item?.title ?? item?.name ?? item?.yoast_head_json?.title ?? "")
    }

    imageFromEmbeddedPost(item) {
        const media = item?._embedded?.["wp:featuredmedia"]?.[0]
        const candidates = [
            media?.source_url,
            media?.media_details?.sizes?.full?.source_url,
            media?.media_details?.sizes?.large?.source_url,
            media?.media_details?.sizes?.medium_large?.source_url,
            item?.jetpack_featured_media_url,
            item?.featured_image_src,
            item?.better_featured_image?.source_url
        ]
        for (const candidate of candidates) {
            const url = this.normalizeImageUrl(candidate)
            if (url) return url
        }
        return ""
    }

    comicFromApiItem(item) {
        const link = item?.link ?? item?.url ?? ""
        const id = this.extractAlbumId(link)
        if (!id) return null
        const title = this.valueFromApiTitle(item) || id
        const cover = this.imageFromEmbeddedPost(item)
        return {
            id,
            title,
            subtitle: "Everia Club",
            cover,
            tags: [],
            description: this.absoluteUrl(link || this.albumPath(id)),
            language: "image"
        }
    }

    apiSearchPaths(keyword, page) {
        const query = encodeURIComponent(this.cleanText(keyword))
        const currentPage = this.normalizePage(page, 1)
        if (!query) return []
        const params = `_embed=1&per_page=30&page=${currentPage}&search=${query}`
        return [
            `/wp-json/wp/v2/posts?${params}`,
            `/?rest_route=/wp/v2/posts&_embed=1&per_page=30&page=${currentPage}&search=${query}`,
            `/wp-json/wp/v2/search?per_page=30&page=${currentPage}&subtype=post&search=${query}`,
            `/?rest_route=/wp/v2/search&per_page=30&page=${currentPage}&subtype=post&search=${query}`
        ]
    }

    async fillSearchCovers(comics, keyword) {
        const results = []
        const seen = {}
        const unique = comics.filter(comic => {
            if (!comic || !comic.id || seen[comic.id]) return false
            seen[comic.id] = true; return true
        })
        let cursor = 0, stopped = false
        const worker = async () => { while (cursor < unique.length && !stopped) {
            const index = cursor++, comic = unique[index]
            if (comic.cover) {
                results[index] = comic
                continue
            }
            let doc
            try {
                doc = await this.getDocument(this.albumPath(comic.id), this.siteUrl, 0)
                const root = this.detailRoot(doc)
                const title = this.cleanText(root?.querySelector?.("h1")?.text || comic.title)
                const cover = this.firstImageUrl(root)
                if (cover) {
                    results[index] = {
                        ...comic,
                        title: title || comic.title,
                        cover
                    }
                }
            } catch (error) {
                if (/403|429|验证|访问受限|captcha|challenge/i.test(String(error))) { stopped = true; throw error }
                // Search result without a cover is unusable as a Venera list item, skip it.
            } finally {
                doc?.dispose()
            }
        } }
        await Promise.all([worker(), worker()])
        return results.filter(Boolean)
    }

    async loadApiSearchPage(keyword, page) {
        let lastError = null
        for (const path of this.apiSearchPaths(keyword, page)) {
            try {
                const response = await this.getText(path, this.siteUrl, 0)
                const data = JSON.parse(String(response.body ?? ""))
                if (!Array.isArray(data)) continue
                const rawComics = data.map((item) => this.comicFromApiItem(item)).filter((item) => item && item.id)
                if (!rawComics.length) continue
                const comics = await this.fillSearchCovers(rawComics, keyword)
                if (comics.length) {
                    const totalPages = Number(this.headerValue(response.headers, "x-wp-totalpages") || 0)
                    return {
                        comics,
                        maxPage: Math.max(this.normalizePage(page, 1), totalPages || 1)
                    }
                }
            } catch (error) {
                lastError = error
            }
        }
        if (lastError) throw lastError
        return { comics: [], maxPage: 1 }
    }

    isNavigationPath(path) {
        const value = String(path ?? "")
        return !value || value === "/" ||
            /^\/(?:cdn-cgi|page|tag|category|search|about|dmca|privacy|contact|feed|wp-|sitemap|robots|static)(?:\/|$)/i.test(value) ||
            /^\/(?:Gravure|Japan|Korea|Thailand|Chinese|Cosplay)\.html\/?$/i.test(value)
    }

    extractAlbumId(href) {
        if (!href) return ""
        const path = this.pathFromUrl(href)
        if (this.isNavigationPath(path)) return ""
        if (/\.(?:jpe?g|png|webp|avif|gif|css|js|ico|svg|xml|txt)(?:$|[?#])/i.test(path)) return ""
        return this.safeDecode(path.replace(/^\/+|\/+$/g, ""))
    }

    albumPath(id) {
        if (!id) return "/"
        if (/^https?:\/\//i.test(String(id))) return this.pathWithQueryFromUrl(id)
        return "/" + String(id).replace(/^\/+|\/+$/g, "")
    }

    splitSrcset(value) {
        return String(value ?? "")
            .split(",")
            .map((part) => part.trim().split(/\s+/)[0])
            .filter((part) => part.length > 0)
    }

    extractStyleUrls(style) {
        const result = []
        const re = /url\((['"]?)(.*?)\1\)/ig
        let match
        while ((match = re.exec(String(style ?? ""))) !== null) {
            if (match[2]) result.push(match[2])
        }
        return result
    }

    normalizeImageUrl(raw) {
        const value = String(raw ?? "").trim()
        if (!value || value === "#" || value.startsWith("data:image/") || /^javascript:/i.test(value)) return ""
        const url = this.absoluteUrl(value).split("#")[0]
        if (!url) return ""
        const lower = url.toLowerCase()
        if (lower.includes("placeholder") || lower.includes("loading") || lower.includes("/logo") || lower.includes("favicon") || lower.includes("/search.png")) return ""
        if (!/\.(jpe?g|png|webp|avif)(?:[?#].*)?$/i.test(url)) return ""
        return url
    }

    imageCandidates(node) {
        const attrs = node?.attributes ?? {}
        return [
            attrs["data-original"],
            attrs["data-original-src"],
            attrs["data-lazy-src"],
            attrs["data-src"],
            attrs["data-url"],
            attrs["data-full"],
            attrs["data-large_image"],
            attrs.src,
            ...this.splitSrcset(attrs.srcset),
            ...this.splitSrcset(attrs["data-srcset"]),
            ...this.splitSrcset(attrs["data-lazy-srcset"]),
            ...this.extractStyleUrls(attrs.style)
        ]
    }

    firstImageUrl(root) {
        const nodes = root?.querySelectorAll?.("img, source[srcset], [style*='background']") ?? []
        for (const node of nodes) {
            for (const candidate of this.imageCandidates(node)) {
                const url = this.normalizeImageUrl(candidate)
                if (url) return url
            }
        }
        return ""
    }

    hrefLooksLikeAlbum(href) {
        const id = this.extractAlbumId(href)
        return !!id
    }

    nearestAlbumContainer(element) {
        let current = element
        for (let depth = 0; depth < 8 && current; depth++) {
            const classes = this.classList(current).join(" ").toLowerCase()
            const images = current.querySelectorAll?.("img, source[srcset], [style*='background']") ?? []
            const albumLinks = (current.querySelectorAll?.("a[href]") ?? []).filter((a) => this.hrefLooksLikeAlbum(a.attributes?.href))
            if (images.length && albumLinks.length && (
                current.localName === "article" ||
                current.localName === "li" ||
                classes.includes("post") ||
                classes.includes("item") ||
                classes.includes("list") ||
                classes.includes("entry") ||
                classes.includes("grid") ||
                depth >= 2
            )) return current
            current = current.parent
        }
        return element?.parent ?? element
    }

    resultRoot(doc) {
        return doc.querySelector(".mainleft") ??
            doc.querySelector(".post-list") ??
            doc.querySelector(".posts") ??
            doc.querySelector(".site-main") ??
            doc.querySelector("main") ??
            doc.querySelector("#main") ??
            doc.querySelector(".content") ??
            doc.body
    }

    listingItems(doc) {
        const root = this.resultRoot(doc)
        const items = root.querySelectorAll("article, li, .post, .item, .list-item, .grid-item, .entry, .postbox")
            .filter((item) => item.querySelector("a[href]") && this.firstImageUrl(item) && (item.querySelectorAll("a[href]") ?? []).some((a) => this.hrefLooksLikeAlbum(a.attributes?.href)))
        if (items.length) return items
        return root.querySelectorAll("a[href]")
            .filter((link) => this.hrefLooksLikeAlbum(link.attributes?.href))
            .map((link) => this.nearestAlbumContainer(link))
            .filter((item, index, list) => item && list.indexOf(item) === index)
    }

    titleFromContainer(container, link) {
        const image = container?.querySelector?.("img[alt]") ?? link?.querySelector?.("img[alt]")
        const candidates = [
            link?.attributes?.title,
            link?.attributes?.["aria-label"],
            this.cleanText(link?.text),
            container?.querySelector?.("h1 a[href], h2 a[href], h3 a[href], h4 a[href]")?.text,
            container?.querySelector?.("h1, h2, h3, h4, h5, h6, .title, .entry-title")?.text,
            image?.attributes?.alt,
            image?.attributes?.title
        ]
        for (const candidate of candidates) {
            const text = this.cleanText(candidate)
            if (text && !/^search$/i.test(text) && !/^next$/i.test(text) && !/^pre$/i.test(text)) return text.replace(/\s*-\s*Everia\s*club\s*$/i, "")
        }
        return ""
    }

    parseAlbumList(doc) {
        const drafts = {}
        for (const item of this.listingItems(doc)) {
            const links = item.querySelectorAll?.("h1 a[href], h2 a[href], h3 a[href], h4 a[href], .title a[href], .entry-title a[href], a[href]") ?? []
            for (const link of links) {
                const href = link.attributes?.href ?? ""
                const id = this.extractAlbumId(href)
                if (!id) continue
                const container = item ?? this.nearestAlbumContainer(link)
                const cover = this.firstImageUrl(container ?? link)
                const title = this.titleFromContainer(container, link)
                if (!title || !cover) continue
                if (!drafts[id]) {
                    drafts[id] = {
                        id,
                        title,
                        cover,
                        detailUrl: this.absoluteUrl(href)
                    }
                }
                break
            }
        }
        return Object.values(drafts).map((item) => ({
            id: item.id,
            title: item.title || item.id,
            subtitle: "Everia Club",
            cover: item.cover,
            tags: [],
            description: item.detailUrl,
            language: "image"
        }))
    }

    pageNumberFromHref(href) {
        const value = String(href ?? "")
        return Number(
            /[?&]page=(\d+)/i.exec(value)?.[1] ??
            /[?&]paged=(\d+)/i.exec(value)?.[1] ??
            /\/page\/(\d+)\/?/i.exec(value)?.[1] ??
            "0"
        )
    }

    pageNumberFromLink(link) {
        const hrefPage = this.pageNumberFromHref(link?.attributes?.href)
        if (hrefPage > 0) return hrefPage
        const label = this.cleanText(`${link?.text ?? ""} ${link?.attributes?.["aria-label"] ?? ""} ${link?.attributes?.title ?? ""}`)
        const textPage = Number(/^(\d+)$/.exec(label)?.[1] ?? "0")
        return textPage > 0 ? textPage : 0
    }

    paginationLinks(doc) {
        return doc.querySelectorAll("a[href]")
            .filter((link) => {
                const href = String(link.attributes?.href ?? "")
                const rel = String(link.attributes?.rel ?? "").toLowerCase()
                const classes = this.classList(link).join(" ").toLowerCase()
                const parentClasses = this.classList(link.parent).join(" ").toLowerCase()
                const text = this.cleanText(link.text).toLowerCase()
                return /[?&](?:page|paged)=\d+/i.test(href) ||
                    /\/page\/\d+/i.test(href) ||
                    rel.includes("next") ||
                    classes.includes("page") ||
                    parentClasses.includes("page") ||
                    parentClasses.includes("pagination") ||
                    parentClasses.includes("nav-links") ||
                    /^\d+$/.test(text) ||
                    text === "next" ||
                    text === "pre" ||
                    text === "prev"
            })
    }

    parseMaxPage(doc, currentPage = 1) {
        let maxPage = this.normalizePage(currentPage, 1)
        for (const link of this.paginationLinks(doc)) {
            const page = this.pageNumberFromLink(link)
            if (page > maxPage) maxPage = page
            const rel = String(link.attributes?.rel ?? "").toLowerCase()
            const text = this.cleanText(link.text).toLowerCase()
            if ((rel.includes("next") || text === "next") && maxPage < currentPage + 1) maxPage = currentPage + 1
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

    listFallbackPaths(basePath, page) {
        const currentPage = this.normalizePage(page, 1)
        if (currentPage <= 1) return [basePath || "/"]
        const base = basePath || "/"
        const results = []
        results.push(this.pagePath(base, currentPage, "page"))
        results.push(this.pagePath(base, currentPage, "paged"))
        if (base === "/") results.push(`/page/${currentPage}/`)
        return results.filter((value, index, list) => value && list.indexOf(value) === index)
    }

    async loadPagedList(basePath, page) {
        const currentPage = this.normalizePage(page, 1)
        const firstDoc = await this.getDocument(basePath)
        try {
            if (currentPage <= 1) {
                return {
                    comics: this.parseAlbumList(firstDoc),
                    maxPage: this.parseMaxPage(firstDoc, 1)
                }
            }
            const candidates = [
                this.findPagePath(firstDoc, basePath, currentPage),
                ...this.listFallbackPaths(basePath, currentPage)
            ].filter((value, index, list) => value && list.indexOf(value) === index)

            let lastError = null
            let emptyResult = null
            for (const pagePath of candidates) {
                let pageDoc
                try {
                    pageDoc = await this.getDocument(pagePath, basePath)
                    const comics = this.parseAlbumList(pageDoc)
                    const result = {
                        comics,
                        maxPage: Math.max(this.parseMaxPage(firstDoc, 1), this.parseMaxPage(pageDoc, currentPage), currentPage)
                    }
                    if (comics.length) return result
                    emptyResult = emptyResult ?? result
                } catch (error) {
                    lastError = error
                } finally {
                    pageDoc?.dispose()
                }
            }
            if (emptyResult) return emptyResult
            throw lastError ?? "Everia Club list page parse failed."
        } finally {
            firstDoc.dispose()
        }
    }

    searchPaths(keyword, page) {
        const query = encodeURIComponent(this.cleanText(keyword))
        const currentPage = this.normalizePage(page, 1)
        if (!query) return []
        if (currentPage <= 1) {
            return [
                `/?s=${query}`,
                `/?search=${query}`,
                `/?keyword=${query}`,
                `/search/${query}/`,
                `/search/?q=${query}`
            ]
        }
        return [
            `/?s=${query}&paged=${currentPage}`,
            `/page/${currentPage}/?s=${query}`,
            `/?s=${query}&page=${currentPage}`,
            `/?search=${query}&page=${currentPage}`,
            `/?keyword=${query}&page=${currentPage}`,
            `/search/${query}/page/${currentPage}/`,
            `/search/?q=${query}&page=${currentPage}`
        ]
    }

    normalizeForSearch(text) {
        return this.cleanText(text)
            .toLowerCase()
            .replace(/[\u3000\s\-–—_.,，。・|:：/\\()[\]【】「」『』]+/g, " ")
            .trim()
    }

    searchTokens(keyword) {
        const normalized = this.normalizeForSearch(keyword)
        if (!normalized) return []
        const parts = normalized.split(/\s+/).filter((part) => part.length >= 2)
        return parts.length ? parts : [normalized]
    }

    titleMatchesKeyword(title, keyword) {
        const text = this.normalizeForSearch(title)
        const key = this.normalizeForSearch(keyword)
        if (!key) return true
        if (text.includes(key)) return true
        const tokens = this.searchTokens(keyword)
        if (!tokens.length) return false
        return tokens.some((token) => text.includes(token))
    }

    filterSearchResults(comics, keyword) {
        const seen = {}
        return comics
            .filter((comic) => comic?.id && comic?.title && comic?.cover)
            .filter((comic) => this.titleMatchesKeyword(comic.title, keyword))
            .filter((comic) => {
                if (seen[comic.id]) return false
                seen[comic.id] = true
                return true
            })
    }

    async fallbackSearchFromLists(keyword, page) {
        const currentPage = this.normalizePage(page, 1)
        const maxProbe = currentPage <= 1 ? 8 : Math.min(currentPage + 6, 20)
        const results = []
        const seen = {}
        for (let listPage = currentPage; listPage <= maxProbe; listPage++) {
            let doc
            try {
                doc = await this.getDocument(this.pagePath("/", listPage), this.siteUrl, 0)
                const comics = this.filterSearchResults(this.parseAlbumList(doc), keyword)
                for (const comic of comics) {
                    if (!seen[comic.id]) {
                        seen[comic.id] = true
                        results.push(comic)
                    }
                }
            } catch (_) {
                // Best-effort fallback only.
            } finally {
                doc?.dispose()
            }
            if (results.length >= 30) break
        }
        return {
            comics: results,
            maxPage: results.length ? Math.max(1, currentPage + 1) : 1
        }
    }

    async loadHtmlSearchPage(keyword, page) {
        let lastError = null
        let emptyResult = null
        const currentPage = this.normalizePage(page, 1)
        for (const path of this.searchPaths(keyword, currentPage)) {
            let doc
            try {
                doc = await this.getDocument(path, this.siteUrl, 0)
                const comics = this.filterSearchResults(this.parseAlbumList(doc), keyword)
                const result = {
                    comics,
                    maxPage: comics.length ? Math.max(this.parseMaxPage(doc, currentPage), currentPage) : 1
                }
                if (result.comics.length) return result
                emptyResult = emptyResult ?? result
            } catch (error) {
                lastError = error
            } finally {
                doc?.dispose()
            }
        }
        if (emptyResult) return emptyResult
        throw lastError ?? "No Everia Club HTML search result."
    }

    async loadSearchPage(keyword, page) {
        const key = this.cleanText(keyword)
        const currentPage = this.normalizePage(page, 1)
        if (!key) return { comics: [], maxPage: 1 }

        let apiError = null
        try {
            const apiResult = await this.loadApiSearchPage(key, currentPage)
            if (apiResult.comics.length) return apiResult
        } catch (error) {
            apiError = error
        }

        let htmlError = null
        try {
            const htmlResult = await this.loadHtmlSearchPage(key, currentPage)
            if (htmlResult.comics.length) return htmlResult
        } catch (error) {
            htmlError = error
        }

        const fallback = await this.fallbackSearchFromLists(key, currentPage)
        if (fallback.comics.length) return fallback

        if (apiError || htmlError) {
            throw htmlError ?? apiError
        }
        return { comics: [], maxPage: 1 }
    }

    detailRoot(doc) {
        return doc.querySelector("article .entry-content") ??
            doc.querySelector("article .post-content") ??
            doc.querySelector(".entry-content") ??
            doc.querySelector(".post-content") ??
            doc.querySelector("article") ??
            doc.querySelector(".mainleft") ??
            doc.querySelector("main") ??
            doc.body
    }

    similarTitle(alt, title) {
        const left = this.cleanText(alt).toLowerCase()
        const right = this.cleanText(title).toLowerCase()
        if (!left || !right) return true
        if (left === right || left.includes(right) || right.includes(left)) return true
        const significant = right.split(/[\s,，。・|\-–—_]+/).filter((part) => part.length >= 3)
        return significant.length ? significant.some((part) => left.includes(part)) : true
    }

    imageInsideNavigationOrRelated(image) {
        let current = image
        for (let depth = 0; depth < 8 && current; depth++) {
            const classes = this.classList(current).join(" ").toLowerCase()
            const id = String(current.id ?? "").toLowerCase()
            if (classes.includes("related") || classes.includes("recommend") || classes.includes("sidebar") || classes.includes("widget") || id.includes("related") || id.includes("sidebar")) return true
            current = current.parent
        }
        return false
    }

    extractDetailImages(root, title) {
        const images = []
        const fallback = []
        const seen = {}
        const seenFallback = {}
        const add = (url, preferred) => {
            if (!url) return
            if (preferred) {
                if (!seen[url]) {
                    seen[url] = true
                    images.push(url)
                }
            } else if (!seenFallback[url]) {
                seenFallback[url] = true
                fallback.push(url)
            }
        }
        const nodes = root?.querySelectorAll?.("img, source[srcset], [style*='background']") ?? []
        for (const image of nodes) {
            if (this.imageInsideNavigationOrRelated(image)) continue
            const alt = this.cleanText(image.attributes?.alt || image.attributes?.title)
            const preferred = !alt || this.similarTitle(alt, title)
            for (const candidate of this.imageCandidates(image)) {
                add(this.normalizeImageUrl(candidate), preferred)
            }
        }
        return images.length ? images : fallback
    }

    categoryLabels(root) {
        return root.querySelectorAll?.("a[href*='/tag/'], a[href*='tag='], a[rel='tag']")
            .map((link) => this.cleanText(link.text))
            .filter((text, index, list) => text && list.indexOf(text) === index) ?? []
    }

    parseDetail(doc, id) {
        const root = this.detailRoot(doc)
        const normalizedId = this.extractAlbumId(id) || id
        const title = this.cleanText(root.querySelector("h1")?.text ||
            doc.querySelector("meta[property='og:title']")?.attributes?.content ||
            doc.querySelector("title")?.text ||
            normalizedId).replace(/\s*-\s*Everia\s*club\s*$/i, "")
        const images = this.extractDetailImages(root, title)
        if (!images.length) {
            throw "No Everia Club images found. The page may still be behind Cloudflare, or the detail DOM changed."
        }
        const tags = this.categoryLabels(root)
        return {
            title,
            subtitle: tags.join(", ") || "Everia Club",
            cover: images[0],
            description: this.absoluteUrl(this.albumPath(normalizedId)),
            tags: {
                "tag": tags,
                "source": ["Everia Club"]
            },
            chapters: {
                "main": "Photos"
            },
            thumbnails: images,
            uploadTime: doc.querySelector("meta[property='article:published_time']")?.attributes?.content ?? "",
            updateTime: doc.querySelector("meta[property='article:modified_time']")?.attributes?.content ?? "",
            uploader: "Everia Club",
            url: this.absoluteUrl(this.albumPath(normalizedId)),
            maxPage: images.length,
            stars: null
        }
    }

    explore = [
        {
            title: "Everia Club Latest",
            type: "multiPageComicList",
            load: async (page) => this.loadPagedList("/", page)
        }
    ]

    search = {
        load: async (keyword, options, page) => this.loadSearchPage(keyword, page),
        enableTagsSuggestions: false
    }

    category = {
        title: "Everia Club Categories",
        parts: [
            {
                name: "Category",
                type: "fixed",
                itemType: "category",
                categories: ["Gravure", "Japan", "Korea", "Thailand", "Chinese", "Cosplay"],
                categoryParams: ["Gravure.html", "Japan.html", "Korea.html", "Thailand.html", "Chinese.html", "Cosplay.html"]
            }
        ],
        enableRankingPage: false
    }

    categoryComics = {
        load: async (category, param, options, page) => this.loadPagedList(this.catalogPath(param || `${category}.html`), page)
    }

    comic = {
        idMatch: "^(?:https?://(?:www\\.)?everiaclub\\.com/)?(?!page(?:[/?#]|$)|tag(?:[/?#]|$)|category(?:[/?#]|$)|search(?:[/?#]|$)|about(?:[/?#]|$)|dmca(?:[/?#]|$)|cdn-cgi(?:[/?#]|$)|static(?:[/?#]|$))[^?#]+$",
        loadInfo: async (id) => {
            const normalizedId = this.extractAlbumId(id) || String(id ?? "").replace(/^\/+|\/+$/g, "")
            const doc = await this.getDocument(this.albumPath(normalizedId))
            try {
                const detail = this.parseDetail(doc, normalizedId)
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
            const normalizedId = this.extractAlbumId(id) || id
            const referer = this.detailCache[normalizedId]?.url ?? this.absoluteUrl(this.albumPath(normalizedId))
            return {
                url: imageKey,
                headers: this.imageHeadersFor(imageKey, referer),
                onLoadFailed: () => ({
                    url: imageKey,
                    headers: {
                        ...this.imageHeadersFor(imageKey, referer),
                        "Cache-Control": "no-cache",
                        "Pragma": "no-cache"
                    }
                })
            }
        },
        onThumbnailLoad: (imageKey) => {
            if (!imageKey) return { url: "about:blank", headers: {} }
            return {
                url: imageKey,
                headers: this.imageHeadersFor(imageKey, this.siteUrl)
            }
        },
        link: {
            domains: ["www.everiaclub.com", "everiaclub.com"],
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

