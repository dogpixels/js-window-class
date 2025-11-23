# Flam's Window Class

Define a desktop area and open links in iframe powered windows that can be dragged around, resized and respect the boundaries of said desktop.

Currently open windows are encoded to the location hash, so that sharing a link re-opens them as they were.

## Setup

Copy the following minimal file structure to your project:

```
project/
├─ config/
│  ├─ win-urls.json
├─ css/
│  ├─ win.min.css
├─ js/
│  ├─ win.min.js
├─ pages/
│  ├─ win-404.html
│  ├─ win-img.html
```

Include `css/win.min.css` and `js/win.min.js` in your document:

```html
<!DOCTYPE html>
<html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="css/win.min.css" /> <!-- Windows CSS -->
    </head>
    <body>
        <!-- Your content goes first -->
        <script src="js/win.min.js"></script> <!-- Windows Javascript -->
    </body>
</html>
```

That's it. Don't forget to configure `config/win-urls.json` and adjust any paths, should you have copied files elsewhere. See the following _Configuration_ section about it.

## Usage

To create a window, call it via javascript:

```html
<a href="#" onclick="new Window('key', {x: 20, y: 20, width: 640, height: 480})">click me</a>
```

The `key` must exist in your `config/win-urls.json`. All options within the second parameter are optional.

## Configuration

### URL Dictionary

The most important (and mandatory) configuration is done in `config/win-urls.json`. Each window your website could possibly open must have an entry within that file, specifying which URL to display within that window:

```json
{
    "welcome": "pages/welcome.html",
    "about": "pages/aboutme.html",
    "self-portrait": "img/portrait.jpg",
    "my-first-artwork": "pages/win-img.html#img/first_artwork.jpg"
}
```
> This configuration, as opposed to simply passing the url to the window directly, prevents hijacking your windows to open unintented (possibly malicious) contents.

---

### Deeper Settings

Both `css/win.min.css` and `js/win.min.js` let you configure certain aspects of your windows. The following tables give you an overview of the existing settings and what you can do with them.

##### In `css/win.min.css`:

| Key                          | Default | CSS Syntax   | Description                                                                                            |
| ---                          | ---     | ---          | ---                                                                                                    |
| `--win-border-color`         | #000    | color      | `--win-border-width` color surrounding the window on all four sides                                    |
| `--win-title-bar-color`      | #000    | background | title bar color (or gradient) surrounded by `--win-border-width`                                       |
| `--win-title-bar-text-color` | #fff    | color      | title bar foreground (text) color                                                                      |
| `--win-background`           | #ccc    | background | if the document body within an iframe doesn't define a covering background, this color shines through. |
| `--win-min-width`            | 200px   | width      | minimum window width; should be no less than `win-title-height`                                        |
| `--win-title-height`         | 20px    | height     | height of title bar (excluding `--win-border-width`); also alters close button size                    |
| `--win-border-width`         | 3px     | width      | window border width; also defines how easy it is to grab resizing handles                              |

##### In `js/win.min.js`:
| Key                         | Default                | JS Type  | Description                                                                                                                                                         |
| ---                         | ---                    | ---      | ---                                                                                                                                                                 |
| `FULLSCREEN_THRESHOLD`      | 640                    | number | On screens lower than this width, x, y and width declarations will be ignored and the window stretched across the full width. 0 disables this behaviour altogether. |
| `WINDOWS_PARENT_ELEMENT_ID` | "desktop"              | string | ID (excluding # symbol) of the parent block element to create all windows within.                                                                                   |
| `WINDOWS_REGISTRY_FILE`     | "config/win-urls.json" | string | Path to a JSON file containing a dictionary of windows keys and their associated content URLs.                                                                      |
| `WINDOWS_404_ERROR_FILE`    | "pages/win-404.html"   | string | Path to a html file to be displayed in case a key is missing in the WINDOWS_REGISTRY_FILE.                                                                          |

## Image Viewer
Comes with a special "image viewer" page that adjusts its window according to the image within. To utilize it, change your URL association in `config/win-urls.json` 

from: `"my-image: "img/gallery/test-image.jpg",`

to: `"my-image: "pages/win-img.html#img/gallery/test-image.jpg`.

Then create the window by ideally specifying either desired width or height:
`<a href="#" onclick="new Window('my-image', {x: 20, y: 20, width: 720});">open image</a>`.

This opens `pages/win-img.html` in your iframe and passes the image path as a parameter. The special `win-img.html` file measures the resulting image dimensions, reports them back to the window and adjusts accordingly to your desires.

> Troubleshooting: Should using this file fail due to pathing errors, check `basepath` configuration on line 15 within.

## Attributions

Thank you to Mijira for clearing up my confusions regarding proper window resizing. <3