/**
 * @fileoverview Flam's Window Class
 * @version 1.6
 * @author Flam <draconigen@dogpixels.net>
 * @license AGPL-3.0
 * Provided "as is", without warranty of any kind.
 */

/**
 * On screens lower than this width, x, y and width declarations will be ignored and the window stretched across the full width.
 * 0 disables this behaviour altogether.
 * @type {number}
 */
const FULLSCREEN_THRESHOLD = 640;

/**
 * ID (excluding # symbol) of the parent block element to create all windows within.
 * @type {string}
 */
const WINDOWS_PARENT_ELEMENT_ID = 'desktop';

/**
 * Path to a JSON file containing a dictionary of windows keys and their associated content URLs.
 * This dictionary must exist for security reasons.
 * @example {"home": "home", "about": "pages/aboutme.html", "me_irl": "img/me.jpg"}
 * @type {string}
 */
const WINDOWS_REGISTRY_FILE = 'config/win-urls.json';

/**
 * Path to a html file to be displayed in case a key is missing in the WINDOWS_REGISTRY_FILE.
 * @type {string}
 */
const WINDOWS_404_ERROR_FILE = 'pages/win-404.html';

/**
 * @event windows:initialized
 * @type {CustomEvent<Array<Window>}
 * Fired if and after Windows have been restored from Save Data (location hash).
 * CustomEvent.etail contains an array of initialized windows.
 * 
 * Listener example:
 * 
 * window.addEventListener('windows:initialized', (e) => {
 *    console.log("windows loaded from Save Data; the windows: ", e.detail);
 * });
 */

/**
 * Window class
 * Represents an iframe-powered window with drag'n'drop functionality.
 * 
 * @property {string} key - Unique window key, must match a key in WINDOWS_REGISTRY_FILE.
 * @property {Element} html - The HTML Element this object represents.
 */
class Window {
    /** @type {Object} parsed integer values of --win-min-width, --win-title-height and --win-border-width from CSS */
    #css = {minWinWidth: 0, borderWidth: 0, titleHeight: 0};

    /** @type {Object} mouse and window positions and dimensions at the moment of a mousedown event */
    #mdown = {mx: 0, my: 0, x: 0, y: 0, w: 0, h: 0};

    /** @type {ElementType.div} title bar element at the top of the window */
    #titleBar = null;

    /** @type {ElementType.h1} title bar text element within #titlebar */
    #titleBarText = null;

    /** @type {ElementType.iframe} the iframe element at the window's heart */
    #iframe = null;

    /** @type {Object} this.html parent dimensions and position relative to viewport, updated by updateDesktopRect() */
    #desktopRect = {x: 0, y: 0, w: 0, h: 0};

    /** @type {object} width and hight values initially passed on window creation, if provided */
    #initialDim = {w: null, h: null};
    
    /** @type {boolean} true if window had been restored from Save Data (location hash), false otherwise */
    #restoredFromSaveData = false;

    /** @type {Object}  */
    static mouseEvent = { target: null, type: null, direction: null }

    /** @type {number} the currently highest window z-index; only ever increments, good luck reaching an int overflow */
    static topZIndex = 0;

    /** @type {Array.Window} array of all Window objects on the viewport */
    static windowList = [];
    
    /** @type {string} the last saveData written to window history, to check against for changes */
    static lastSaveData = '';

    /**
     * 
     * @param {string} key A unique identifier for the window's content. Must match an entry in your WINDOWS_REGISTRY_FILE.
     * @param {Object} options An object of optional parameters:
     * {
     *  title {string}: text for the window title bar; if none is provided, the content's document title will be used, or "Untitled" if that fails;
     *  width {number}: windows width; defaults to 640;
     *  height {number}: windows height; defaults to 480;
     *  x {number}: windows horizontal position within its parent container ("desktop"), defaults to 20;
     *  y {number}: windows vertical position within its parent container ("desktop"), defaults to 20
     * } 
     */
    constructor(key, options = {}) {
        this.key = key;

        // get parent element to attach window in
        const parentElement = document.getElementById(WINDOWS_PARENT_ELEMENT_ID);
        if (!parentElement) {
            console.error(`Failed to find any element with id="#${WINDOWS_PARENT_ELEMENT_ID}" in which to create windows within.`);
            return;
        }

        // save css-defined styles for later use
        const cs0 = window.getComputedStyle(document.body);
        const cs1 = window.getComputedStyle(document.getElementById('window-property-convert'));
        this.#css = {
            minWinWidth: parseFloat(cs0.getPropertyValue('--win-min-width')),
            borderWidth: parseFloat(cs1.width),
            titleHeight: parseFloat(cs1.height)
        };

        // Store initial window size for later use in resizeToContent()
        if (options.hasOwnProperty('width'))
            this.#initialDim.w = Math.max(options.width, this.#css.minWinWidth);
        if (options.hasOwnProperty('height'))
            this.#initialDim.h = Math.max(options.height, this.#css.titleHeight);
        
        // merge passed options, of which some are optional, with sensible defaults
        const defaults = { title: 'loading…', width: 640, height: 480, x: 20, y: 20 };
        options = { ...defaults, ...options, ...{url: Window.registry[key]} };

        if (options.private?.hasOwnProperty('restoredFromSaveData'))
            this.#restoredFromSaveData = options.private.restoredFromSaveData;

        // retrieve target iframe url for this window from a static registry (this is for security reasons)
        if (options.url === undefined) {
            console.warn(`Could not create window with key '${key}' because that key is missing in '${WINDOWS_REGISTRY_FILE}'.`,options.url);
            options.url = WINDOWS_404_ERROR_FILE;
        }

        // override x, y and width to fullscreen on mobile screens
        if (FULLSCREEN_THRESHOLD > 0 && parentElement.clientWidth <= FULLSCREEN_THRESHOLD) {
            options.x = 0;
            options.y = 0;
            options.width = 65535;
            options.height = 65535;
        }

        // window element
        this.html = document.createElement('article');
        this.html.classList.add('window');
        this.html.style.cssText = `width:${options.width}px;height:${options.height}px;left:${options.x}px;top:${options.y}px;z-index:${Window.topZIndex++};`;
        this.html.addEventListener('mousedown', () => {
            this.html.style.zIndex = Window.topZIndex++;
        });
        parentElement.appendChild(this.html);
        this.updateDesktopRect();
        this.#clampToDesktop();

        // title bar
        this.#titleBar = document.createElement('div');
        this.html.appendChild(this.#titleBar);
        this.#titleBar.classList.add('window-title-bar');
        this.#titleBar.addEventListener('mousedown', (e) => {
            const rect = this.html.getBoundingClientRect();
            this.#mdown = {
                // mx: e.clientX,               // irrelevant for pos case
                // my: e.clientY,               // irrelevant for pos case
                // w: this.html.offsetWidth,    // irrelevant for pos case
                // h: this.html.offsetHeight,   // irrelevant for pos case
                x: e.clientX - rect.left,  // mouseX - windowX = offset from left edge
                y: e.clientY - rect.top    // mouseY - windowY = offset from top edge
            };
            Window.setMouseEvent(this, 'pos');
        });

        this.#titleBarText = document.createElement('h1');
        this.#titleBar.appendChild(this.#titleBarText);

        // close button
        const cb = document.createElement('div');
        this.html.appendChild(cb);
        cb.classList.add('window-close-button');
        cb.addEventListener('click', () => {
            this.close();
        });

        // content iframe
        this.#iframe = document.createElement('iframe');
        this.html.appendChild(this.#iframe);
        this.#iframe.classList.add('window-content');
        this.#iframe.src = options.url;

        // set h1.window-title-bar innerText
        if (options.title !== 'loading…') {
            this.#titleBarText.innerText = options.title;
        }
        else {
            this.#iframe.onload = () => {
                try {
                    if (!this.#iframe.contentWindow.document.title)
                        throw "error reading iframe document title";
                    this.#titleBarText.innerText = this.#iframe.contentWindow.document.title;
                } catch (ex) {
                    console.warn("failed to load window title, reason:", ex);
                    this.#titleBarText.innerText = "Untitled";
                }
            };
        }

        // resize handlers
        ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].forEach(direction => {
            let div = document.createElement('div');
            this.html.appendChild(div);
            div.classList.add('window-resize-handler', direction);
            div.addEventListener('mousedown', (e) => {
                e.preventDefault(); // prevent text selection
                this.#mdown = {
                    mx: e.clientX,
                    my: e.clientY,
                    w: this.html.offsetWidth,
                    h: this.html.offsetHeight,
                    x: this.html.offsetLeft,
                    y: this.html.offsetTop
                };
                Window.setMouseEvent(this, 'dim', direction);
            });
        });

        Window.windowList.push(this);
    }

    /**
     * Save current parent container element ("desktop") corner coordinates within viewport.
     * This is to compensate in case the "desktop" has been repositioned e.g. due to other elements in the viewport.
     */
    updateDesktopRect() {
        const desktop = this.html.parentElement;
        const rect = desktop.getBoundingClientRect();
        this.#desktopRect = {
            x: rect.left + window.scrollX,
            y: rect.top + window.scrollY,
            w: desktop.clientWidth,
            h: desktop.clientHeight
        };
    }

    /**
     * Moves the windows around following the mouse cursor + position offset
     * while respecting parent container ("desktop") boundaries in accordance to window dimensions.
     * 
     * @param {number} mx mouse position X
     * @param {number} my mouse position Y
     */
    setPos(mx, my) {
        const relX = mx - this.#desktopRect.x;
        const relY = my - this.#desktopRect.y;

        const maxX = this.#desktopRect.w - this.html.offsetWidth;
        const maxY = this.#desktopRect.h - this.html.offsetHeight;

        let x = Math.max(0, Math.min(relX - this.#mdown.x, maxX));
        let y = Math.max(0, Math.min(relY - this.#mdown.y, maxY));

        this.html.style.left = `${x}px`;
        this.html.style.top = `${y}px`;
    }

    /**
     * Resizes the window according to the previously set Window.mouseEvent.direction, following the mouse cursor.
     * Respects css-provided minimums and parent element ("desktop") boundaries.
     * 
     * @param {number} mx current mouse position X
     * @param {number} my current mouse position Y
     */
    setDim(mx, my) {
        const dir = Window.mouseEvent.direction;

        const dx = mx - this.#mdown.mx;
        const dy = my - this.#mdown.my;

        // init geometry
        let x = this.#mdown.x;
        let y = this.#mdown.y;
        let w = this.#mdown.w;
        let h = this.#mdown.h;

        let corners = {
            left: x,
            top: y,
            right: x + w,
            bottom: y + h
        }

        // alter geometry
        if (dir.includes('w')) corners.left = x + dx;
        if (dir.includes('e')) corners.right = x + w + dx;
        if (dir.includes('n')) corners.top = y + dy;
        if (dir.includes('s')) corners.bottom = y + h + dy;

        // update geometry
        x = corners.left;
        y = corners.top;
        w = corners.right - corners.left;
        h = corners.bottom - corners.top;

        // apply css min-width / min-height
        const minWidth = this.#css.minWinWidth;
        const minHeight = this.#css.titleHeight + this.#css.borderWidth;

        if (w < minWidth) {
            if (dir.includes('w')) {
                x = x + w - minWidth; // shift left edge right
            }
            w = minWidth;
        }
        if (h < minHeight) {
            if (dir.includes('n')) {
                y = y + h - minHeight; // shift top edge down
            }
            h = minHeight;
        }

        // apply desktop boundaries
        if (x < 0) { // left
            const shift = -x;
            x = 0;
            w -= shift;
            if (w < minWidth) w = minWidth;
        }
        if (y < 0) { // top
            const shift = -y;
            y = 0;
            h -= shift;
            if (h < minHeight) h = minHeight;
        }
        if (x + w > this.#desktopRect.w) { // right
            const shift = x + w - this.#desktopRect.w;
            w -= shift;
            if (w < minWidth) {
                w = minWidth;
                x = this.#desktopRect.w - w;
            }
        }
        if (y + h > this.#desktopRect.h) { // bottom
            const shift = y + h - this.#desktopRect.h;
            h -= shift;
            if (h < minHeight) {
                h = minHeight;
                y = this.#desktopRect.h - h;
            }
        }

        // clamp to desktop / minimums
        x = Math.max(0, Math.min(x, this.#desktopRect.w - minWidth));
        y = Math.max(0, Math.min(y, this.#desktopRect.h - minHeight));
        w = Math.max(minWidth, Math.min(w, this.#desktopRect.w - x));
        h = Math.max(minHeight, Math.min(h, this.#desktopRect.h - y));

        // apply style
        this.html.style.left = `${x}px`;
        this.html.style.top = `${y}px`;
        this.html.style.width = `${w}px`;
        this.html.style.height = `${h}px`;
    }

    /**
     * Resizes the window based on its initial dimensions and the aspect ratio derived from the passed parameters.
     * If the window was created with a width, that width is maintained and the height adjusted.
     * If the window was created with a height, that height is maintained and the width adjusted.
     * If both were provided, the value resulting in a larger window prevails.
     * If none were provided, both desired dimensions are applied.
     * Respects desktop boundaries and css minimums.
     * 
     * @param {number} contentW 
     * @param {number} contentH 
     */
    resizeToContent(contentW, contentH) {
        // prevent further resizing on windows restored from Save Data (location hash)
        if (this.#restoredFromSaveData)
            return;

        const addW = 2 * this.#css.borderWidth;
        const addH = 2 * this.#css.borderWidth + this.#css.titleHeight;

        // we'll make it easy on ourselves and work with only the content
        if (this.#initialDim.w) this.#initialDim.w -= addW; // note: resizeToContent() is the last function to run,
        if (this.#initialDim.h) this.#initialDim.h -= addH; // hence we can safely override this var
        let currentW = parseInt(this.html.style.width) - addW;
        let currentH = parseInt(this.html.style.height) - addH;

        const posX = parseInt(this.html.style.left);
        const posY = parseInt(this.html.style.top);

        // user provided both dimensions, adjust to the larger result
        if (this.#initialDim.w && this.#initialDim.h) {
            const customH = (this.#initialDim.w * contentH/contentW);
            const customW = (this.#initialDim.h * contentW/contentH);
            const area_cH = this.#initialDim.w * customH;
            const area_cW = this.#initialDim.h * customW;
            currentW = area_cH > area_cW ? this.#initialDim.w : customW;
            currentH = area_cH > area_cW ? customH : this.#initialDim.h;
        }
        // user provided width, adjust height
        else if (this.#initialDim.w) {
            currentW = this.#initialDim.w;
            currentH = currentW * contentH/contentW;
        }
        // user provided height, adjust width
        else if (this.#initialDim.h) {
            currentH = this.#initialDim.h;
            currentW = currentH * contentW/contentH;
        }

        // currentW exceeds desktop width, adjust both to fit
        if (currentW + addW + posX > this.#desktopRect.w) {
            let oldW = currentW;
            currentW = this.#desktopRect.w - addW - posX;
            currentH = currentW * currentH/oldW;
        }

        // currentH exceeds desktop height, adjust both to fit
        if (currentH + addH + posY > this.#desktopRect.h) {
            let oldH = currentH;
            currentH = this.#desktopRect.h - addH - posY;
            currentW = currentH*currentW/oldH;
        }
        
        // if you don't have rounding-errors, do you even Math?
        currentW = Math.ceil(currentW);
        currentH = Math.ceil(currentH);
        
        // apply (with window decorations added back in)
        this.html.style.width = `${currentW + addW}px`;
        this.html.style.height = `${currentH + addH}px`;

        // kudos to Mijira <3
    }

    /**
     * Centers the window onto the desktop.
     */
    centerToDesktop() {
        const centerX = Math.max(0, (this.#desktopRect.w - parseInt(this.html.style.width)) / 2);
        const centerY = Math.max(0, (this.#desktopRect.h - parseInt(this.html.style.height)) / 2);
        this.html.style.left = `${centerX}px`;
        this.html.style.top = `${centerY}px`;
    }

    /**
     * Reduces exceeding geometry parameters (w/h/x/y) to fit the available space ("desktop").
     * This enables the user to e.g. command windows to always take up the right side (x=9999)
     * or take up the entire available width (w=9999) or height (h=9999).
     */
    #clampToDesktop() {
        const desktopW = this.#desktopRect.w;
        const desktopH = this.#desktopRect.h;

        const minWidth = this.#css.minWinWidth;
        const minHeight = this.#css.titleHeight + 2 * this.#css.borderWidth;

        // parse current style
        let x = parseInt(this.html.style.left) || 0;
        let y = parseInt(this.html.style.top) || 0;
        let w = parseInt(this.html.style.width) || minWidth;
        let h = parseInt(this.html.style.height) || minHeight;

        // exceeding x -> right-align
        if (x > desktopW) {
            x = desktopW - w;
        }
        // exceeding y -> bottom-align
        if (y > desktopH) {
            y = desktopH - h;
        }
        // exceeding width -> fill remaining width
        if (w > desktopW) {
            w = desktopW - x;
        }
        // exceeding height -> fill remaining height
        if (h > desktopH) {
            h = desktopH - y;
        }

        // ensure horizontal fit
        if (x < 0) {
            w += x; // x is negative, so this reduces width
            x = 0;
        }
        if (x + w > desktopW) {
            w = desktopW - x;
        }
        w = Math.max(minWidth, w);
        x = Math.max(0, Math.min(x, desktopW - w));

        // ensure vertical fit
        if (y < 0) {
            h += y; // y is negative
            y = 0;
        }
        if (y + h > desktopH) {
            h = desktopH - y;
        }
        h = Math.max(minHeight, h);
        y = Math.max(0, Math.min(y, desktopH - h));

        // apply style
        this.html.style.left = `${x}px`;
        this.html.style.top = `${y}px`;
        this.html.style.width = `${w}px`;
        this.html.style.height = `${h}px`;
    }

    /**
     * Close this window.
     */
    close() {
        this.html.remove();
        Window.windowList.splice(Window.windowList.indexOf(this), 1);
    }

    /**
     * Called in mousedown events to set which Window object is going to be manipulated
     * on mousemove. Also called on mouseup to release the window by passing null.
     * 
     * @param {Window|null} target The affected Window object to man
     * @param {string} type May be either 'pos' or 'dim', depending on whether a title bar or a resize handler has been hit.
     * @param {string} direction May be n, ne, e, se, s, sw, w or nw. In case of a resize handler, this specifies WHICH handler.
     */
    static setMouseEvent(target, type = null, direction = null) {
        if (target) {
            document.body.classList.add('window-drag-active');
            target.updateDesktopRect();
        } else {
            document.body.classList.remove('window-drag-active');
        }
        Window.mouseEvent.target = target;
        Window.mouseEvent.type = type;
        Window.mouseEvent.direction = direction;
    }

    /**
     * Provides a string containing all eligible, open windows, semicolon-separated in the format `key,w,h,x,y,z`.
     * 
     * @returns {string} Window save data.
     */
    static getSaveData() {
        let r = [];
        Window.windowList.forEach(win => {
            r.push(`${win.key},${win.html.offsetWidth},${win.html.offsetHeight},${win.html.offsetLeft},${win.html.offsetTop},${win.html.style.zIndex}`);
        });
        return r.join(';');
    }

    /**
     * Returns the highest (by z-index) window whose iframe matches the specified URL, or null.
     * 
     * @param {string} url The complete URL to match against iframe sources.
     * @returns {Window|null} The window instance with the matching iframe and highest z-index, or null if no matching window is found.
     */
    static findByUrl(url) {
        let ret = null;
        let topz = 0;

        for (const win of Window.windowList) {
            const iframe = win.html.getElementsByTagName('iframe')[0];
            if (iframe && iframe.src === url) {
                const z = parseInt(win.html.style.zIndex) || 0;
                if (z > topz) {
                    topz = z;
                    ret = win;
                }
            }
        }

        return ret;
    }

    /**
     * A function to be run once after document load and before windows usage.
     * Loads windows URL dictionary and creates windows from save data (location hash).
     * The WINDOWS_REGISTRY_FILE must be set up before running this function.
     * 
     * > Note: This function needs to be run only once at initialization. If setup succeeded,
     * > subsequently running this function will simply return true without doing anything.
     * 
     * @fires windows:initialized
     * @returns {boolean} true on setup success, false otherwise
     */
    static async initWindows() {
        if (Window.registry) // already run
            return true;

        try {
            // prevent caching for live data
            let url = WINDOWS_REGISTRY_FILE;
            url += `?${Date.now()}`

            Window.registry = await (await fetch(url)).json();
            if (!Window.registry)
                throw "malformed data";
        }
        catch (ex) {
            console.error(`failed to load window dictionary '${WINDOWS_REGISTRY_FILE}', reason: ${ex}`);
            return false;
        }

        // load windows from save data stored within the browser's window location hash
        // data format: key,width,height,x,y,z
        let restored_windows = [];
        if (window.location.hash) {
            window.location.hash.substring(1).split(';').forEach(item => {
                let data = item.split(',');
                if (!Window.registry[data[0]])
                    return; // drop unregistered windows from save data
                restored_windows.push(new Window(data[0], {
                    width: parseInt(data[1]),
                    height: parseInt(data[2]),
                    x: parseInt(data[3]),
                    y: parseInt(data[4]),
                    z: parseInt(data[5]),
                    private: {restoredFromSaveData: true}
                }));
            });
        }

        window.dispatchEvent(new CustomEvent('windows:initialized', {detail: restored_windows}));
        return true;
    }
}

Window.initWindows();

document.addEventListener('mouseup', () => {
    Window.setMouseEvent(null);
});

document.addEventListener('mousemove', (e) => {
    if (Window.mouseEvent.type == 'pos' && e.buttons != 0) {
        Window.mouseEvent.target.setPos(e.clientX, e.clientY);
    }
    else if (Window.mouseEvent.type == 'dim' && e.buttons != 0) {
        Window.mouseEvent.target.setDim(e.clientX, e.clientY);
    }
});

// Update desktop rect on scroll/resize
window.addEventListener('resize', () => {
    Window.windowList.forEach(win => {
        win.updateDesktopRect();
    });
});

window.addEventListener('message', (e) => {
    // console.debug("window message received:", e.data);
    if (e.origin !== window.origin) {
        console.warn(`window communication warning: origin mismatch, should be '${window.origin}', but is`, e.origin);
        return;
    }

    if (e.data.type === 'PassClientScriptReady') {
        // todo: investigate what this is and why Firefox is firing it for no apparent reason
        return;
    }

    if (!e.data.action) {
        console.warn('window communication warning: message without action field encountered.');
        return;
    }

    switch (e.data.action) {
        case 'window':
            new Window(e.data.key, e.data);
            break;

        // this comes from win-img.html as it reports back the image dimensions
        case 'resize':
            Window.findByUrl(e.source.location.href)?.resizeToContent(e.data.width, e.data.height);
            break;
    }
});

// set up location with window save data update interval
setInterval(() => {
    const current = Window.getSaveData();
    if (current != Window.lastSaveData) {
        history.replaceState(undefined, undefined, `#${current}`);
        Window.lastSaveData = current;
    }
}, 500);
