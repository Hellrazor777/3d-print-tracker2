# 3D Print Tracker — User Guide

A desktop app for tracking your 3D print jobs, managing filament colours, monitoring your Bambu Lab printers, and keeping on top of your finished goods inventory.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Products View](#products-view)
3. [Parts Boxes](#parts-boxes)
4. [Print Queue View](#print-queue-view)
5. [Archive View](#archive-view)
6. [Colours View](#colours-view)
7. [Inventory View](#inventory-view)
8. [Printers View](#printers-view)
9. [N3D Browse](#n3d-browse)
10. [Filament Library](#filament-library)
11. [Settings](#settings)
12. [Importing & Exporting](#importing--exporting)
13. [Cloud Sync](#cloud-sync)
14. [Tips & Troubleshooting](#tips--troubleshooting)

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

The main navigation has tabs: **Products**, **Archive**, **Colours**, **Inventory**, **Printers**, and **Queue**.

---

## Products View

This is your day-to-day workspace. Everything you're actively printing lives here.

### Adding a Product

Click **+ Add Product** in the top bar. Fill in:

- **Name** — required. Must be unique.
- **Category** — optional. Organises products into sections (you set categories up in Settings).
- **Description** — optional notes.
- **Shiny variant** — tick this if it's a special shiny/glitter version of a design.
- **Designer / Source** — optional. Useful for tracking where designs came from (e.g. N3D Melbourne, Thangs, MakersWorld).
- **Image** — optional. Upload a photo or render of the finished product.

### Adding Parts to a Product

Once a product exists, expand the card and click **+ add part** at the bottom of the parts table.

In the part form:

- **Part name** — e.g. "Body", "Left Claw", "Base".
- **Product** — which product this part belongs to.
- **Variant** — optional (e.g. "v2", "large").
- **Colours** — add one or more filament colours. For each colour you can set the hex value, colour name, brand, and product name.
- **Quantity** — how many of this part you need to print.
- **Status** — where this part is in the workflow.

### Part Statuses

Parts move through four statuses:

1. **Planning** — not started yet.
2. **Queue** — ready to print, waiting for the printer.
3. **Printing** — currently on the printer.
4. **Done** — finished printing.

Click the status badge on any part to change it. You can also use the **▷Queue** button to push a part to the print queue directly from the product card.

### How Products Are Grouped

Products automatically sort into sections based on their parts' statuses:

- **Ready to build** (green) — all parts are done.
- **Printing** (amber) — at least one part is currently printing.
- **Commenced** (blue) — some parts are done, work is ongoing.
- **Your custom categories** — all other products, grouped by the category you assigned.

### Product Card Actions

Expand a product card to see its parts table and these action buttons:

| Button | What it does |
|---|---|
| **Manage** | Edit product name, category, description, boxes, image, etc. |
| **↓ Archive** | Move product to the Archive (keeps all history). |
| **🗂 Folder** | Open the product's folder in Windows Explorer. |
| **▶ Slicer** | Open the product's 3MF in Bambu Studio or Orca Slicer. |
| **↑ 3MF** | Upload a .3mf file to this product's folder. |
| **+ Inv** | Quickly add finished units to inventory. |
| **🌐 website** | Open the product page on N3D Melbourne (if saved). |

> The folder, slicer, and 3MF buttons only appear in the desktop app and require a 3MF root folder to be set in Settings.

### The 3MF Badge

If a product has a .3mf file attached, a **3MF** badge appears. Click it to mark the product as **pre-sliced** (turns green with a ✓). Use the filter bar to show only sliced / unsliced / pre-sliced products.

### Completing a Product

When all parts are done, a green **"ready to build — click when done"** badge appears. Click it to open the completion dialog, enter how many units you've built, and add them to inventory.

---

## Parts Boxes

Parts boxes let you assign physical storage boxes to products, auto-number them by location, and print adhesive labels with a QR code.

### Setting Up Locations

Before adding boxes, go to **Settings → 📦 Parts Box Labels** and add your storage locations. Each location gets a **letter** (e.g. A, B, C) and a **name** (e.g. "Drawer 1", "Top Shelf", "Workshop Cabinet").

Example setup:

| Letter | Name |
|---|---|
| A | Bedside Drawer |
| B | Workshop Shelf |
| C | Market Bag |

### Adding a Box to a Product

1. Open a product card and click **Manage**.
2. Under **📦 Parts boxes**, choose a location from the dropdown.
3. Click **+ Add box**.
4. The app auto-assigns the next available number for that location — e.g. if A1 and A2 already exist anywhere in your tracker, the new box gets **A3**.
5. You can add multiple boxes to the same product.
6. Click **Save**.

### Printing a Label

Once a product has boxes, each box appears as a clickable badge on the product card (e.g. `📦 A3 🖨`).

Click the badge to open the **label preview**. The label includes:
- Box code (large, easy to read)
- Product name
- Location name
- Parts list
- QR code (encodes "Product Name | Box Code" for scanning)

Click **🖨 Print label** to send it to your printer. A print window opens sized exactly to your configured label dimensions.

### Label Size

The default size is **2.25 × 1.25 inches** (standard Dymo label). You can change this in **Settings → 📦 Parts Box Labels → Label size**.

---

## Print Queue View

The **Queue** tab shows all parts across all products that are currently in **queue** status — your print to-do list.

- Parts are grouped by product.
- Use the **▷Queue** button on any part row in the Products view to add it here.
- Once printed, change the status to **Printing** or **Done** from the status badge.

---

## Archive View

Completed products live here. You can:

- **↑ Restore** — move a product back to active if you're printing more.
- **⟳ Restart** — reset all part statuses and print counts to zero (inventory history is kept).
- **Delete** — permanently remove the product and all its parts.

If a product has a parts box assigned, the app will remind you to check the box before restoring or restarting.

---

## Colours View

A different way to view your work — sorted by filament colour rather than product.

All parts currently in **queue** status are grouped by their assigned colour. Useful for batching prints by filament to avoid unnecessary swaps.

- Hover a colour swatch to see the colour name, brand, and product name.
- Click a product name (shown in blue) to jump to that product in the Products view.
- Use the search bar to filter by colour name, product name, or part name.

---

## Inventory View

Track how many finished units you have and where they are.

### Adding to Inventory

Inventory is added automatically when you complete a product (via the "ready to build" button), or manually via **+ Add Product** in the Inventory view, or the **+ Inv** button on any product card.

### Inventory Cards

Each card shows:

- **Built** — total units ever produced.
- **On hand** — units remaining after distributions.
- **Distributed** — badges for each destination you've sent stock to.

Expand a card to:

- Adjust per-location storage quantities with the −/+ buttons.
- Adjust the total built count.
- Log outgoing stock — choose a destination, set a quantity, add an optional note, click **Log**.
- View and delete distribution history entries.

### Mobile Access

You can manage inventory from your phone while packing at a market or counting stock.

1. Make sure your phone is on the same Wi-Fi as your computer.
2. In the Inventory view, click **Show phone URL**.
3. Open that address in your phone's browser (e.g. `http://192.168.1.50:3000`).

Changes sync back to the desktop app automatically.

> If the URL shows `localhost`, it means the app couldn't detect your LAN IP. Check your network connection.

---

## Printers View

Monitor and control your Bambu Lab printers in real time.

### Connecting Your Printers

1. Click **⚙ Settings → Bambu Lab** and enter your Bambu Cloud credentials (email and password).
2. The app fetches your printer list from Bambu Cloud automatically — no manual IP entry needed.
3. Go to the **Printers** tab. Your printers appear as cards.

### What You Can See

Each printer card shows:

- Live status (Idle, Printing, Paused, etc.)
- Nozzle and bed temperature (with dial gauges)
- Current print job name and progress
- Estimated time remaining
- Filament colour for the current job
- Live camera feed (see below)

### Print Controls

While a print is running, you can:

- **Pause** — pause the current print.
- **Resume** — resume a paused print.
- **Stop** — cancel the print entirely.
- **Unload filament** — trigger an AMS unload.
- **Clear error** — dismiss HMS error messages.

### Live Camera Feed

Click **▶ Camera** on any printer card to start the live feed.

> **Camera not working? See Troubleshooting below.**

### Cloud Camera Relay

If you use the cloud web app and want to see camera feeds remotely (not just on your local network), use the **Cloud Camera Relay** panel at the bottom of the Printers view.

1. Set `CAMERA_RELAY_TOKEN` in your Render environment variables (generate one with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
2. In the relay panel, enter your cloud URL and the same token.
3. Click **Start relay** — the desktop app will push camera frames to your cloud server.

---

## N3D Browse

Click **N3D Browse** in the top bar to browse and import designs from N3D Melbourne.

1. Enter your API key in Settings and click **Connect** (or it auto-connects if the key is already saved).
2. Use the **Category** and **Profile** dropdowns to filter designs.
3. Use the search box to find specific designs.
4. Click designs to select them (tick boxes appear). Selected designs show in the import queue on the right.
5. Choose a colour mode: **Together** (all one colour) or **Distribute** (spread across multiple colours).
6. Click **Import selected** to create parts in your tracker with colour data pre-filled.

> Cover images are only downloaded in the desktop app (requires a 3MF root folder to be set in Settings).

---

## Filament Library

Click **📚 Filament Library** in the Settings footer to manage your personal filament database.

- Add filaments with brand, product name, colour name, and hex colour.
- These appear as suggestions when setting colours on parts, so you don't have to type brand names every time.
- Edit or delete entries at any time.

---

## Settings

Click **⚙ Settings** in the top bar.

### Appearance
Choose **Auto** (follows your system), **Light**, or **Dark** theme.

### Cloud Sync
Paste your Supabase connection string to sync data with the cloud web app. See [Cloud Sync](#cloud-sync) below.

### Product Categories
Add, rename, reorder, or remove custom categories. These appear as sections in the Products view.

The categories **Ready to Build**, **Printing**, and **Commenced** are system categories and can't be edited.

### 3MF Files
Set the root folder where your .3mf files are stored. Also set your N3D Melbourne session tokens here for 3MF downloads from the N3D browser.

### Slicer
Choose your default slicer (Bambu Studio or Orca Slicer) and optionally set a custom executable path.

### Inventory
- **Show + inv button** — toggle the quick-add button on product cards.
- **Storage Locations** — add and name your storage spots (e.g. "Shelf A", "Display Cabinet").
- **Outgoing Destinations** — add destinations for logging distributions (e.g. "Store", "Market", "Website Order").

### 📦 Parts Box Labels
- **Locations** — add named locations with letter codes (A = Drawer 1, B = Top Shelf, etc.)
- **Label size** — set width × height in inches. Default is 2.25 × 1.25 in (standard Dymo label). Click Reset to go back to default.

---

## Importing & Exporting

### Import CSV
Click **↑ Import CSV** in Settings to bulk-import parts from a spreadsheet.

Required columns: `product`, `part_name`

Optional columns: `variant`, `colour_name`, `colour_hex`, `stl`, `qty`, `category`, `description`

If a product already exists, you'll be asked whether to add parts to it or create a new separate product.

### Export CSV
Click **↓ Export CSV** to download all your current products and parts as a `.csv` file. Useful for backups or sharing.

---

## Cloud Sync

The app can sync your data to a hosted cloud database so you can access your tracker from any browser.

### Setup

1. Create a free [Supabase](https://supabase.com) project.
2. In Supabase, go to **Project Settings → Database → Connection string → URI** and copy the connection string.
3. In the app, open **Settings → Cloud Sync**, paste the connection string, and click **Connect**.
4. The app will create the required table automatically on first connection.
5. Click **↑ Push local to cloud** to sync your current data up.

### Web App
Once connected, deploy the web app (see README for Netlify/Render instructions). You can then view your tracker from any device at your web URL.

---

## Tips & Troubleshooting

### General Tips

- **Batch by colour** — use the Colours view before a print session to see everything queued for a particular filament. Print all parts of one colour together to reduce filament swaps.
- **Use categories** — create categories matching your product types (e.g. "Miniatures", "Functional Parts", "Gifts") to keep the Products view organised.
- **Pre-sliced badge** — once you've sliced a design and saved the .3mf, mark it as pre-sliced so you know it's print-ready without re-slicing.
- **Distribution notes** — when logging outgoing stock, add a note (e.g. an order number or event name) so you have a record of where everything went.
- **Parts boxes** — set up locations in Settings first, then add boxes to products via Manage. The box code (e.g. A3) is auto-assigned and never reused.

---

### Camera Troubleshooting

#### Camera not starting / black screen

**Step 1 — Check your network.** The camera connects directly to the printer's IP on your local network. Your computer and printer must be on the same Wi-Fi or LAN. It will not work over a VPN or across different subnets.

**Step 2 — Check ffmpeg (H2D, H2S, X1C, P2S only).** These models use an RTSPS stream on port 322, which requires **ffmpeg** to be installed separately. Older models (P1S, P1P, A1) use a different protocol that works without it.

To install ffmpeg, open a terminal and run:
```
winget install Gyan.FFmpeg
```
Or download manually from https://ffmpeg.org/download.html and extract to `C:\ffmpeg\` (so `ffmpeg.exe` is at `C:\ffmpeg\bin\ffmpeg.exe`).

After installing, restart the app and try the camera again.

**Step 3 — Check Windows Firewall.** Sometimes Windows Firewall blocks outbound connections on port 322 or 6000. Try temporarily disabling the firewall to test. If that fixes it, add an outbound rule for those ports.

**Step 4 — Check the error message.** Open DevTools in the app with **Ctrl+Shift+I**, go to the Console tab, then click **▶ Camera**. Any error from the camera connection will appear there — it'll tell you exactly what's failing.

**Step 5 — Printer model not detected.** If your printer's model name in Bambu Cloud doesn't exactly match `H2D`, `H2S`, `X1C`, or `P2S`, the app may try the wrong protocol. Check the Console for clues. You can report this so the model list can be updated.

#### Camera works on the local app but not on the cloud web app

This is expected — the cloud server can't reach your printer directly. You need the **Cloud Camera Relay** (see Printers View section above).

---

### Mobile inventory URL shows localhost

The app couldn't detect your local IP address. Check that your computer is connected to Wi-Fi (not just ethernet on some configurations), or try restarting the app.

### Products disappeared / showing sample data

This usually means the app data path changed. The app stores data in `%APPDATA%\3d-print-tracker\data.json`. Check that file exists and isn't empty. If you reinstalled the app, the data should still be there.

### Cloud connection says "error"

- Double-check the Supabase connection string — it should start with `postgresql://`.
- Make sure your Supabase project is not paused (free tier projects pause after inactivity — log in to Supabase and resume it).
- Try disconnecting and reconnecting in Settings.
