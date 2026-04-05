# 3D Print Tracker — User Guide

A desktop app for tracking your 3D print jobs, managing filament colours, and keeping on top of your finished goods inventory.

---

## Getting Started

When you first open the app you'll see the **Products** view. The top bar shows live stats at a glance:

| Stat | What it means |
|---|---|
| Active Products | How many products you're currently working on |
| Parts Tracked | Total number of parts across all active products |
| Pieces Printed | How many individual pieces are done vs. total needed |
| Ready to Build | Products where every part has been fully printed |
| On Hand | Total finished units in inventory (after distributions) |

The main navigation has four tabs: **Products**, **Archive**, **Colours**, and **Inventory**.

---

## Products View

This is your day-to-day workspace. Everything you're actively printing lives here.

### Adding a Product

Click **+ Add Product** in the top bar. Fill in:

- **Name** — required. Must be unique.
- **Category** — optional. Organises products into sections (you set categories up in Settings).
- **Description** — optional notes.
- **Shiny variant** — tick this if it's a special shiny/glitter version of a design.
- **Designer / Source** — optional. Useful if you're tracking where designs came from (e.g. N3D Melbourne, Thangs, MakersWorld).
- **Image** — optional. Upload a photo or render of the finished product.

### Adding Parts to a Product

Once a product exists, click **Manage** on its card, or expand the card and click **+ add part** at the bottom of the parts table.

In the part form:

- **Part name** — e.g. "Body", "Left Claw", "Base".
- **Product** — which product this part belongs to.
- **Variant** — optional. Useful for things like "v2" or "large".
- **Colours** — add one or more filament colours. For each colour you can set:
  - Hex colour (use the colour picker)
  - Colour name (e.g. "Galaxy Black")
  - Brand (e.g. "Bambu Lab")
  - Product name (e.g. "Hyper PLA Matte")
- **Quantity** — how many of this part you need to print.
- **Status** — where this part is in the workflow (see below).

### Part Statuses

Parts move through four statuses:

1. **Planning** — not started yet, still deciding.
2. **Queue** — ready to print, waiting for the printer.
3. **Printing** — currently on the printer.
4. **Done** — finished printing.

Click the status badge on any part to change it.

### How Products Are Grouped

Products automatically sort into sections based on their parts' statuses:

- **Ready to build** (green) — all parts are done. A green "ready to build — click when done" badge appears. Click it to log the build to inventory.
- **Printing** (amber) — at least one part is currently printing.
- **Commenced** (blue) — some parts are done, but work is ongoing.
- **Your custom categories** — any other products organised by the category you assigned.

Sections can be expanded or collapsed. Use the **+ expand all / − collapse all** buttons inside each section to manage cards quickly.

### Product Card Actions

Expand a product card to see its parts table and these buttons:

| Button | What it does |
|---|---|
| **Manage** | Edit product name, category, description, image, etc. |
| **↓ Archive** | Move product to the Archive (keeps all history). |
| **🗂 Folder** | Open the product's folder on your computer. |
| **▶ Slicer** | Open the product folder in Bambu Studio or Orca Slicer. |
| **↑ 3MF** | Upload a .3mf file to this product's folder. |
| **+ Inv** | Quickly add finished units to inventory without archiving. |
| **🌐 website** | Open the product page on N3D Melbourne (if a URL is saved). |

> **Note:** The folder, slicer, and 3MF buttons only appear in the desktop app and require a 3MF root folder to be set in Settings.

### The 3MF Badge

If a product has a .3mf file attached, a **3MF** badge appears on the card. Click it to mark the product as **pre-sliced** (turns green with a ✓). Click again to unmark. You can filter products by 3MF status using the filter bar at the top of the Products view.

### Tracking Printed Quantities

In the parts table, click the printed/total count (e.g. **2/5**) to edit the printed count inline. For parts with sub-parts, use the **−** and **+** buttons on each sub-part row to adjust counts individually.

### Completing a Product

When all parts are done, a green **"ready to build — click when done"** button appears. Click it to open the completion dialog, enter how many finished units you've built, and add them to inventory. You can also choose to **archive the product** at this point, which moves it out of the active list.

### Product Images

If a product has an image set, click it to open a full-screen preview. Press **Escape** or click the ✕ to close.

---

## Archive View

Completed products live here. You can:

- **↑ Restore** — move a product back to active if you're printing more.
- **⟳ Restart** — reset all part statuses and print counts back to zero (inventory history is kept).
- **Delete** — permanently remove the product and all its parts.

---

## Colours View

A different way to look at your work — sorted by filament colour rather than product.

All parts currently in **queue** status are grouped by their assigned colour. This makes it easy to batch your prints by filament.

- The colour name, brand, and product name show in a tooltip when you hover a swatch.
- Click a **product name** (shown in blue underline) to jump straight to that product in the Products view.
- Use the **search bar** (top right) to filter by colour name, product name, or part name.

---

## Inventory View

Track how many finished units you have and where they are.

### Adding to Inventory

Inventory is added automatically when you complete a product (via the "ready to build" button), or manually via **+ Add Product** in the Inventory view header, or the **+ Inv** button on any product card.

### Inventory Cards

Each card shows:

- **Built** — total units ever produced.
- **On hand** — units remaining after distributions.
- **Distributed** — badges for each destination you've sent stock to.

Expand a card to see:

- **Location split** — if you have multiple storage locations, adjust qty per location with the −/+ buttons.
- **Built count** — adjust with −/+ or click the number to type a value.
- **Log outgoing** — choose a destination, set a quantity, add an optional note, and click **Log** to record a distribution.
- **Distribution history** — a full list of past outgoing entries. Click ✕ to delete an entry.

### Mobile Access (Phone/Tablet)

You can manage inventory from your phone while you're packing at a market or counting stock on a shelf.

1. Make sure your phone is on the same Wi-Fi network as your computer.
2. In the Inventory view, click **Show phone URL**.
3. Type that address into your phone's browser (e.g. `http://192.168.1.50:3000`).

The mobile interface lets you adjust built counts, log distributions, and view history — all from your phone. Changes sync back to the desktop app automatically.

> If the URL shows `localhost` or `127.0.0.1`, it means the app couldn't detect your LAN IP. Check your network connection.

---

## Settings

Click **⚙ Settings** in the top bar.

### Appearance
Choose **Auto** (follows your system), **Light**, or **Dark** theme.

### Product Categories
Add, rename, reorder, or remove custom categories. These appear as sections in the Products view and as options when adding/editing products.

The categories **Ready to Build**, **Printing**, and **Commenced** are system categories and cannot be edited — they're automatically assigned based on part statuses.

### 3MF Files
Set the root folder where your .3mf files are stored. When you upload a .3mf via the **↑ 3MF** button, it's copied into a subfolder named after the product inside this root folder.

### Slicer
Choose your default slicer (Bambu Studio or Orca Slicer) and optionally set a custom path to the executable if it's installed in a non-standard location.

### Inventory
- **Show + inv button** — toggle the quick-add button on product cards.
- **Storage Locations** — add and manage locations (e.g. "Shelf A", "Display Cabinet", "Home"). Used for splitting inventory across multiple spots.
- **Outgoing Destinations** — add destinations for logging distributions (e.g. "Store", "Market", "Website Order").

### N3D Integration
Paste your N3D Melbourne API key here to enable the **N3D Browse** feature.

---

## N3D Browse

Click **N3D Browse** in the top bar to browse and import designs from N3D Melbourne.

1. Enter your API key and click **Connect**.
2. Use the **Category** and **Profile** dropdowns to filter designs.
3. Use the search box to find specific designs.
4. Click designs to select them (tick boxes appear). Selected designs show in the import queue.
5. Choose a colour mode:
   - **Together** — all parts in one colour.
   - **Distribute** — spread across multiple colours.
6. Click **Import selected** to create parts in your tracker with colour data pre-filled.

> Cover images are only downloaded to your product folder in the desktop app (requires a 3MF root folder).

---

## Importing & Exporting

### Import CSV
Click **↑ Import CSV** to bulk-import parts from a spreadsheet.

Required columns: `product`, `part_name`

Optional columns: `variant`, `colour_name`, `colour_hex`, `stl`, `qty`, `category`, `description`

If a product already exists, you'll be asked whether to **add parts to the existing product** or **create a new separate product**.

### Export CSV
Click **↓ Export CSV** to download all your current products and parts as a `.csv` file. Useful for backups or sharing.

---

## Tips

- **Batch by colour** — use the Colours view before a print session to see everything waiting in queue for a particular filament. Print all parts of one colour together to avoid unnecessary filament swaps.
- **Use categories** — create categories that match your product types (e.g. "Miniatures", "Functional Parts", "Gifts") to keep the Products view organised.
- **Set up storage locations** — even if you only have one location, naming it something like "Main Shelf" makes inventory cards clearer.
- **Pre-sliced badge** — once you've sliced a design and saved the .3mf, mark it as pre-sliced so you know it's ready to print again at any time without re-slicing.
- **Distribution notes** — when logging outgoing stock, add a note (e.g. an order number or event name) so you have a record of where everything went.
