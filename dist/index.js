// ==UserScript==
// @name         Return Pikabu minus
// @version      0.3
// @namespace    pikabu-return-minus.pyxiion.ru
// @description  Возвращает минусы на Pikabu, а также фильтрацию по рейтингу.
// @author       PyXiion
// @match        *://pikabu.ru/*
// @connect      api.pikabu.ru
// @grant        GM.xmlHttpRequest
// @grant        GM.addStyle
// @grant        GM.getValue
// @grant        GM.setValue
// @require      https://greasyfork.org/scripts/452219-md5-%E5%87%BD%E6%95%B0/code/MD5%20%E5%87%BD%E6%95%B0.js?version=1099124
// @license      MIT
// ==/UserScript==
class HttpRequest {
    constructor(url) {
        this.url = url;
        this.httpMethod = "POST";
        this.headers = new Map();
        this.timeout = 15000;
    }
    addHeader(key, value) {
        this.headers.set(key, value);
        return this;
    }
    setHttpMethod(httpMethod) {
        this.httpMethod = httpMethod;
        return this;
    }
    // virtual
    getData() {
        return {};
    }
    execute(callback) {
        const details = {
            url: this.url,
            method: this.httpMethod,
            headers: Object.fromEntries(this.headers),
            data: JSON.stringify(this.getData()),
            timeout: this.timeout,
            responseType: "json",
            onerror: callback.onError,
            onload: callback.onSuccess,
            // TODO: ontimeout
        };
        details.anonymous = true;
        GM.xmlHttpRequest(details);
    }
    executeAsync() {
        return new Promise((resolve, reject) => {
            this.execute({
                onError: reject,
                onSuccess: resolve
            });
        });
    }
}
;
//#endregion
//#region Other Utils
//#endregion
//#region Pikabu API
var Pikabu;
(function (Pikabu) {
    const DOMAIN = "https://api.pikabu.ru/";
    const API_V1 = DOMAIN + "v1/";
    const API_KEY = "kmq4!2cPl)peZ";
    class API {
        static getDeviceId() {
            return "0";
        }
    }
    API.USER_AGENT = "ru.pikabu.android/1.21.15 (SM-N975F Android 7.1.2)";
    API.COOKIE = "unqKms867=aba48a160c; rm5bH=8c68fbfe3dc5e5f5b23a9ec1a8f784f8";
    class Request extends HttpRequest {
        constructor(domain, controller, params) {
            super(domain + controller);
            this.controller = controller;
            this.params = params;
            this.setHttpMethod("GET");
            this.addHeader("DeviceId", API.getDeviceId());
            this.addHeader("User-Agent", API.USER_AGENT);
            this.addHeader("Cookie", API.COOKIE);
            this.addHeader("Content-Type", "application/json");
        }
        setParam(key, value) {
            this.params[key] = value;
        }
        static getHash(data, controller, ms) {
            const join = Object.values(data).sort().join(',');
            const toHash = [API_KEY, controller, ms, join].join(",");
            const hashed = MD5(toHash);
            return btoa(hashed);
        }
        getData() {
            const ms = Date.now();
            const data = {
                new_sort: 1,
                ...this.params
            };
            return {
                ...data,
                id: "iws",
                hash: Request.getHash(data, this.controller, ms),
                token: ms
            };
        }
        async executeAsync() {
            const response = await super.executeAsync();
            const data = response.response;
            if (!("response" in data)) {
                throw new Error(data?.error?.message ?? "Unknown error");
            }
            return data.response;
        }
    }
    class PostRequest extends Request {
        constructor(controller, params) {
            super(API_V1, controller, params);
            this.setHttpMethod("POST");
        }
    }
    class RatingObject {
    }
    Pikabu.RatingObject = RatingObject;
    class Post extends RatingObject {
        constructor(payload) {
            super();
            this.id = payload.story_id;
            this.rating = payload.story_digs;
            this.pluses = payload.story_pluses;
            this.minuses = payload.story_minuses;
        }
    }
    Pikabu.Post = Post;
    class Comment extends RatingObject {
        constructor(payload) {
            super();
            this.id = payload.comment_id;
            this.parentId = payload.parent_id;
            this.rating = payload.comment_rating;
            this.pluses = payload.comment_pluses;
            this.minuses = payload.comment_minuses;
        }
    }
    Pikabu.Comment = Comment;
    class StoryData {
        constructor(payload) {
            this.story = 'story' in payload ? new Post(payload.story) : null;
        }
    }
    Pikabu.StoryData = StoryData;
    class CommentsData extends StoryData {
        constructor(payload) {
            super(payload);
            this.comments = payload.comments.map((x) => new Comment(x));
        }
    }
    Pikabu.CommentsData = CommentsData;
    let DataService;
    (function (DataService) {
        async function fetchStory(storyId, commentsPage) {
            const params = {
                story_id: storyId,
                page: commentsPage
            };
            try {
                const request = new PostRequest("story.get", params);
                const payload = (await request.executeAsync());
                const commentsData = new CommentsData(payload);
                return commentsData;
            }
            catch (error) {
                console.error(error);
                return null;
            }
        }
        DataService.fetchStory = fetchStory;
    })(DataService = Pikabu.DataService || (Pikabu.DataService = {}));
})(Pikabu || (Pikabu = {}));
//#endregion
//#region Extension
//#region Contants
const DOM_MAIN_QUERY = ".main";
const DOM_HEADER_QUERY = "header.header";
const DOM_SIDEBAR_QUERY = ".sidebar-block.sidebar-block_border";
const DOM_CUSTOM_SIDEBAR_MIN_RATING_INPUT_ID = "min-rating";
const DOM_STORY_QUERY = "article.story";
const DOM_STORY_LEFT_SIDEBAR_CLASS_QUERY = ".story__left";
const DOM_STORY_RATING_BLOCK_CLASS_QUERY = ".story__rating-block";
const DOM_STORY_RATING_COUNT_CLASS_QUERY = ".story__rating-count";
const DOM_STORY_RATING_TOTAL_CLASS_QUERY = ".pikabu-story-rating"; // custom
const DOM_STORY_RATING_BLOCK_UP_CLASS_QUERY = ".story__rating-plus";
const DOM_STORY_RATING_BLOCK_DOWN_CLASS_QUERY = ".story__rating-down";
const DOM_MOBILE_STORY_RATING_FOOTER_CLASS_QUERY = ".story_footer-rating > div"; // it's wrapped
const DOM_COMMENT_ID = "comment_";
const DOM_COMMENT_CLASS_QUERY = ".comment";
const DOM_COMMENT_HEADER_CLASS_QUERY = ".comment__header";
const DOM_COMMENT_BODY_CLASS_QUERY = ".comment__body";
const DOM_COMMENT_HEADER_USER_CLASS_QUERY = ".comment__user";
const DOM_COMMENT_HEADER_RATING_UP_CLASS_QUERY = ".comment__rating-up";
const DOM_COMMENT_HEADER_RATING_CLASS_QUERY = ".comment__rating-count";
const DOM_COMMENT_HEADER_RATING_TOTAL_CLASS_QUERY = ".comment__rating-count";
const DOM_COMMENT_HEADER_RATING_DOWN_CLASS_QUERY = ".comment__rating-down";
const DOM_COMMENT_OWN_HEADER_RATING_COUNT_CLASS_QUERY = ".comment__rating-count";
const ATTRIBUTE_MARK_EDITED = "pikabu-return-minus";
const ATTRIBUTE_STORY_ID = "data-story-id";
const ATTIRUBE_RATING_COUNT = "data-rating";
const ATTIRUBE_MINUSES_COUNT = "data-minuses";
const HTML_SRC_STORY_RATING_BAR = '<div class="pikabu-rating-bar-vertical-pluses"></div>';
const HTML_SRC_MOBILE_STORY_RATING = '<span class="story__rating-count">${rating}</span>';
const HTML_SRC_COMMENT_BUTTON_UP = '<svg xmlns="http://www.w3.org/2000/svg" class="icon icon--comments-next__rating-up icon--comments-next__rating-up_comments"><use xlink:href="#icon--comments-next__rating-up"></use></svg><div class="comment__rating-count">${pluses}</div>';
const HTML_SRC_COMMENT_BUTTON_DOWN = '<div class="comment__rating-count custom-comments-counter">-${minuses}</div><svg xmlns="http://www.w3.org/2000/svg" class="icon icon--comments-next__rating-down icon--comments-next__rating-down_comments"><use xlink:href="#icon--comments-next__rating-down"></use></svg>';
const HTML_SRC_SIDEBAR = '<div class="sidebar-block__content"><details><summary>Return Pikabu Minus</summary><label for="rating">Минимальный рейтинг:</label><input type="number" id="min-rating" name="rating" value="0" step="10" class="input input_editor profile-block input__box settings-main__label" min="-100" max="300"><p class="profile-info__hint"><a href="https://t.me/return_pikabu">Телеграм-канал скрипта</a></p></details></div>';
const HTML_STORY_MINUSES_RATING = document.createElement("div");
HTML_STORY_MINUSES_RATING.className = "story__rating-count";
const HTML_STORY_RATING = HTML_STORY_MINUSES_RATING.cloneNode();
HTML_STORY_RATING.classList.add("pikabu-story-rating");
const HTML_STORY_RATING_BAR = document.createElement("div");
HTML_STORY_RATING_BAR.className = "pikabu-rating-bar-vertical";
HTML_STORY_RATING_BAR.innerHTML = HTML_SRC_STORY_RATING_BAR;
const HTML_COMMENT_RATING_BAR = document.createElement("div");
HTML_COMMENT_RATING_BAR.className = "pikabu-rating-bar-vertical-comment";
HTML_COMMENT_RATING_BAR.innerHTML = HTML_SRC_STORY_RATING_BAR; // not a mistake
const HTML_COMMENT_BUTTON_UP = document.createElement("div");
HTML_COMMENT_BUTTON_UP.className = "comment__rating-up green-is-not-red";
HTML_COMMENT_BUTTON_UP.innerHTML = HTML_SRC_COMMENT_BUTTON_UP;
const HTML_COMMENT_RATING = document.createElement("div");
HTML_COMMENT_RATING.className = "comment__rating-count custom-comments-counter";
const HTML_COMMENT_BUTTON_DOWN = document.createElement("div");
HTML_COMMENT_BUTTON_DOWN.className = "comment__rating-down";
HTML_COMMENT_BUTTON_DOWN.innerHTML = HTML_SRC_COMMENT_BUTTON_DOWN;
const HTML_CUSTOM_SIDEBAR = document.createElement("div");
const EXTRA_CSS = `
.story__rating-down:hover .story__rating-count {
  color:var(--color-danger-800)
}
.custom-comments-counter {
  padding-right: 12px;
}
.comment__rating-count.custom-comments-counter {
  padding-left: 4px;
}
.pikabu-story-rating {
  padding-top: 6px;
  padding-bottom: 6px;
}
.pikabu-pluses {
  color:var(--color-primary-700)
}
.pikabu-minuses {
  color:var(--color-danger-800)
}

.pikabu-rating-bar-vertical {
  position: absolute;
  right: -8px;
  width: 4px;
  height: 100%;
  background: var(--color-danger-800);
  border-radius: 15px;
}
.pikabu-rating-bar-vertical-pluses {
  position: absolute;
  width: 100%;
  background-color: var(--color-primary-700);
  border-radius: 15px;
}

.comment__body {
  position: relative;
}
.pikabu-rating-bar-vertical-comment {
  position: absolute;
  background-color: var(--color-danger-800);
  width: 3px;
  bottom: 20px;
  left: -8px;
  top: 20px;
  max-height: 100px;
}
`;
//#endregion
class Settings {
    constructor() {
        this.minRating = 0;
    }
    save() {
        GM.setValue("settings", JSON.stringify(this));
    }
    static async load() {
        const settings = await GM.getValue("settings");
        if (settings === undefined || settings === null || typeof settings !== "string")
            return new Settings();
        return Object.assign(new Settings(), JSON.parse(settings));
    }
}
class PostElement {
    // Mobile
    // TODO
    constructor(storyElem) {
        this.storyElem = storyElem;
        this.id = parseInt(storyElem.getAttribute(ATTRIBUTE_STORY_ID));
        this.isEdited = storyElem.hasAttribute(ATTRIBUTE_MARK_EDITED);
        storyElem.setAttribute(ATTRIBUTE_MARK_EDITED, "true");
        // check is mobile
        if (PostElement.isMobile === null) {
            const ratingFooterElem = storyElem.querySelector(DOM_MOBILE_STORY_RATING_FOOTER_CLASS_QUERY);
            PostElement.isMobile = ratingFooterElem !== null;
        }
        this.parseAndModify();
    }
    parseAndModify() {
        if (PostElement.isMobile) {
            alert("Mobile version isn't implemented");
            return;
            // TODO
        }
        else {
            this.leftSidebarElem = this.storyElem.querySelector(DOM_STORY_LEFT_SIDEBAR_CLASS_QUERY);
            if (this.leftSidebarElem === null)
                return;
            this.ratingBlockElem = this.leftSidebarElem.querySelector(DOM_STORY_RATING_BLOCK_CLASS_QUERY);
            this.ratingUpElem = this.ratingBlockElem.querySelector(DOM_STORY_RATING_BLOCK_UP_CLASS_QUERY);
            this.ratingDownElem = this.ratingBlockElem.querySelector(DOM_STORY_RATING_BLOCK_DOWN_CLASS_QUERY);
            if (this.isEdited) {
                this.ratingUpCounter = this.ratingUpElem.querySelector(DOM_STORY_RATING_COUNT_CLASS_QUERY);
                this.ratingCounter = this.ratingDownElem.querySelector(DOM_STORY_RATING_TOTAL_CLASS_QUERY);
                this.ratingDownCounter = this.ratingDownElem.querySelector(DOM_STORY_RATING_COUNT_CLASS_QUERY);
            }
            else {
                this.ratingElem = HTML_STORY_RATING.cloneNode(true);
                this.ratingDownCounter = HTML_STORY_MINUSES_RATING.cloneNode(true);
                this.ratingBlockElem.insertBefore(this.ratingElem, this.ratingDownElem);
                this.ratingDownElem.prepend(this.ratingDownCounter);
                this.ratingUpCounter = this.ratingUpElem.querySelector(DOM_STORY_RATING_COUNT_CLASS_QUERY);
            }
            this.ratingCounter = this.ratingElem;
        }
        this.addRatingBar();
        this.isEdited = true;
    }
    addRatingBar() {
        this.ratingBarElem = HTML_STORY_RATING_BAR.cloneNode(true);
        this.ratingBarInnerElem = this.ratingBarElem.firstChild;
        this.ratingBarElem.style.display = "none";
        this.ratingBlockElem.prepend(this.ratingBarElem);
    }
    /**
     * @param ratio from 0 to 1. pluses/total
     */
    updateRatingBar(ratio) {
        this.ratingBarElem.style.display = "";
        this.ratingBarInnerElem.style.height = `${ratio * 100}%`;
    }
    setRating(pluses, minuses) {
        if (!this.isEdited)
            return;
        this.ratingUpCounter.innerText = `${pluses}`;
        this.ratingCounter.innerText = `${pluses - minuses}`;
        this.ratingDownCounter.innerText = `-${minuses}`;
        if (pluses + minuses !== 0)
            this.updateRatingBar(pluses / (pluses + minuses));
        else
            this.updateRatingBar(0.5);
    }
    getId() {
        return this.id;
    }
    static getById(id) {
        const elem = document.querySelector(`${DOM_STORY_QUERY}[${ATTRIBUTE_STORY_ID}="${id}"]`);
        return elem !== null ? new PostElement(elem) : null;
    }
}
PostElement.isMobile = null;
class CommentElement {
    constructor(commentElem) {
        this.commentElem = commentElem;
        this.bodyElem = commentElem.querySelector(DOM_COMMENT_BODY_CLASS_QUERY);
        this.headerElem = this.bodyElem.querySelector(DOM_COMMENT_HEADER_CLASS_QUERY);
        // check is already edited
        this.isEdited = this.commentElem.hasAttribute("pikabu-return-minus");
        this.commentElem.setAttribute("pikabu-return-minus", "true");
        this.userElem = this.headerElem.querySelector(DOM_COMMENT_HEADER_USER_CLASS_QUERY);
        this.isOwn = this.userElem.hasAttribute("data-own")
            && this.userElem.getAttribute("data-own") === "true";
        this.parseAndModify();
    }
    parseAndModify() {
        // delete plus counter
        if (this.isOwn && !this.isEdited) {
            const ratingCountElem = this.commentElem.querySelector(DOM_COMMENT_OWN_HEADER_RATING_COUNT_CLASS_QUERY);
            if (ratingCountElem !== null)
                ratingCountElem.remove();
        }
        if (this.isEdited)
            this.ratingElem = this.headerElem.querySelector(DOM_COMMENT_HEADER_RATING_TOTAL_CLASS_QUERY);
        else
            this.ratingElem = HTML_COMMENT_RATING.cloneNode(true);
        if (this.isOwn && !this.isEdited) {
            // create new buttons and counter
            this.ratingUpElem = HTML_COMMENT_BUTTON_UP.cloneNode(true);
            this.ratingDownElem = HTML_COMMENT_BUTTON_DOWN.cloneNode(true);
            this.headerElem.prepend(this.ratingUpElem, this.ratingElem, this.ratingDownElem);
        }
        else {
            // update buttons
            this.ratingUpElem = this.headerElem.querySelector(DOM_COMMENT_HEADER_RATING_UP_CLASS_QUERY);
            this.ratingDownElem = this.headerElem.querySelector(DOM_COMMENT_HEADER_RATING_DOWN_CLASS_QUERY);
            if (!this.isEdited) {
                // add counter
                this.headerElem.insertBefore(this.ratingElem, this.ratingDownElem);
                this.ratingUpElem.innerHTML = HTML_SRC_COMMENT_BUTTON_UP;
                this.ratingDownElem.innerHTML = HTML_SRC_COMMENT_BUTTON_DOWN;
                // For some reason it becomes invalid after changing outerHTML.
                this.ratingUpElem = this.headerElem.querySelector(DOM_COMMENT_HEADER_RATING_UP_CLASS_QUERY);
                this.ratingDownElem = this.headerElem.querySelector(DOM_COMMENT_HEADER_RATING_DOWN_CLASS_QUERY);
            }
        }
        this.ratingUpCounterElem = this.ratingUpElem.querySelector(DOM_COMMENT_HEADER_RATING_CLASS_QUERY);
        this.ratingCounterElem = this.ratingElem;
        this.ratingDownCounterElem = this.ratingDownElem.querySelector(DOM_COMMENT_HEADER_RATING_CLASS_QUERY);
        this.addRatingBar();
        this.isEdited = true;
    }
    addRatingBar() {
        this.ratingBarElem = HTML_COMMENT_RATING_BAR.cloneNode(true);
        this.ratingBarInnerElem = this.ratingBarElem.firstChild;
        this.bodyElem.prepend(this.ratingBarElem);
    }
    /**
     * @param ratio from 0 to 1. pluses/total
     */
    updateRatingBar(ratio) {
        this.ratingBarInnerElem.style.height = `${ratio * 100}%`;
    }
    setRating(pluses, minuses) {
        if (!this.isEdited)
            return;
        this.ratingUpCounterElem.innerText = `${pluses}`;
        this.ratingCounterElem.innerText = `${pluses - minuses}`;
        this.ratingDownCounterElem.innerText = `-${minuses}`;
        if (pluses + minuses !== 0)
            this.updateRatingBar(pluses / (pluses + minuses));
        else
            this.updateRatingBar(0.5);
    }
    static getById(commentId) {
        const commentElem = document.getElementById(DOM_COMMENT_ID + commentId);
        return (commentElem !== null) ? new CommentElement(commentElem) : null;
    }
}
class SidebarElement {
    constructor(settings, isMobile) {
        this.settings = settings;
        this.sidebarElem = document.createElement("div");
        this.sidebarElem.className = "sidebar-block sidebar-block_border sidebar-block__content menu menu_vertical";
        this.sidebarElem.innerHTML = HTML_SRC_SIDEBAR;
        if (isMobile) {
            const headerElem = document.querySelector(DOM_HEADER_QUERY);
            headerElem.parentNode.prepend(this.sidebarElem);
        }
        else {
            const sidebarElem = document.querySelector(DOM_SIDEBAR_QUERY);
            sidebarElem.parentNode.prepend(this.sidebarElem);
        }
        this.minRatingInput = document.getElementById(DOM_CUSTOM_SIDEBAR_MIN_RATING_INPUT_ID);
        this.minRatingInput.addEventListener("change", this.minRatingChange.bind(this));
        this.minRatingInput.value = `${this.settings.minRating}`;
    }
    minRatingChange(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement))
            return;
        this.settings.minRating = parseInt(target.value);
        this.settings.save();
    }
}
class ReturnPikabuMinus {
    constructor() {
        window.addEventListener("load", this.onLoad.bind(this));
        this.commentsToUpdate = [];
        this.isStoryPage = window.location.href.includes("/story/");
        GM.addStyle(EXTRA_CSS);
    }
    async onLoad() {
        this.settings = await Settings.load();
        this.sidebar = new SidebarElement(this.settings, false);
        this.mutationObserver = new MutationObserver(this.observeMutations.bind(this));
        const mainElem = document.querySelector(DOM_MAIN_QUERY);
        this.mutationObserver.observe(mainElem, {
            childList: true,
            subtree: true
        });
        this.processStaticPosts();
    }
    observeMutations(mutations, observer) {
        let commentAdded = false;
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof HTMLElement))
                    continue;
                // It is the header that is checked, since the comment may be in 
                // the loading state (at this time the header will be absent)
                if (node.matches(DOM_COMMENT_HEADER_CLASS_QUERY)) {
                    commentAdded = true;
                }
                else if (node.matches(DOM_STORY_QUERY)) {
                    this.processStoryElement(node);
                }
            }
        }
        if (commentAdded)
            this.processCachedComments();
    }
    async processCachedComments() {
        const results = await Promise.all(this.commentsToUpdate.map(this.processComment.bind(this)));
        this.commentsToUpdate = this.commentsToUpdate.filter((_v, index) => !results[index]);
    }
    async processComment(comment) {
        const commentHtmlElem = document.getElementById(DOM_COMMENT_ID + comment.id);
        if (commentHtmlElem === null) {
            this.commentsToUpdate.push(comment);
            return false;
        }
        const commentElem = new CommentElement(commentHtmlElem);
        commentElem.setRating(comment.pluses, comment.minuses);
        return true;
    }
    processStaticPosts() {
        const posts = document.querySelectorAll(DOM_STORY_QUERY);
        for (const post of posts) {
            this.processStoryElement(post);
        }
    }
    async processStoryElement(storyElem) {
        const post = new PostElement(storyElem);
        const postData = await Pikabu.DataService.fetchStory(post.getId(), 1);
        post.setRating(postData.story.pluses, postData.story.minuses);
        if (this.isStoryPage) {
            await this.processStoryComments(postData);
        }
        else {
        }
    }
    async processStoryComments(commentsData) {
        const storyId = commentsData.story.id;
        let page = 1;
        while (commentsData.comments.length > 0) {
            const promises = [];
            for (const comment of commentsData.comments) {
                if (comment.parentId !== 0) {
                    this.commentsToUpdate.push(comment);
                    continue;
                }
                promises.push(this.processComment(comment));
            }
            await Promise.all(promises);
            page += 1;
            commentsData = await Pikabu.DataService.fetchStory(storyId, page);
        }
    }
}
var rpm = new ReturnPikabuMinus();
//#endregion