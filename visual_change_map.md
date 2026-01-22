# 🗺️ Visual Change Map - Quick Reference

## 📋 Summary of All Changes

| File | Changes | Lines to Modify |
|------|---------|-----------------|
| **index.html** | 2 changes | ~340, ~370-415 |
| **admin.html** | 3 changes | ~205, ~360-390, ~445-505 |
| **rebalance.html** | 3 changes | ~542, ~620-660, ~960-1100 |

---

## 📄 index.html - 2 Changes

### Change #1: Add Script (1 line)
```
Line ~340: Find this:
  ┌─────────────────────────────────────┐
  │ <script src="js/app.js"></script>  │
  │ <script src="js/chart.js"></script>│ ← Add BETWEEN these
  │ <script>                            │
  └─────────────────────────────────────┘

Add this line:
  ┌─────────────────────────────────────────┐
  │ <script src="js/app.js"></script>      │
  │ <script src="js/dom-utils.js"></script>│ ← NEW LINE
  │ <script src="js/chart.js"></script>    │
  │ <script>                                │
  └─────────────────────────────────────────┘
```

### Change #2: Replace Function (whole function)
```
Line ~370: Find this function:
  ┌──────────────────────────────────────────┐
  │ function updateAssetsList(assets) {     │
  │   const container = ...                  │
  │   if (assets.length === 0) {             │
  │     container.innerHTML = `              │ ← DELETE ALL
  │       <div class="empty-state">          │   OF THIS
  │       ...                                 │
  │     `;                                    │
  │   }                                       │
  │   container.innerHTML = sorted.map(...   │
  │ }                                         │
  └──────────────────────────────────────────┘

Replace with NEW function (from guide above)
  ┌──────────────────────────────────────────┐
  │ function updateAssetsList(assets) {     │
  │   const container = ...                  │
  │   if (assets.length === 0) {             │
  │     DOMUtils.showEmptyState(...)         │ ← SAFE!
  │     return;                               │
  │   }                                       │
  │   container.innerHTML = '';              │
  │   sorted.forEach(asset => {              │
  │     const item = DOMUtils.create...      │
  │   });                                     │
  │ }                                         │
  └──────────────────────────────────────────┘
```

---

## 📄 admin.html - 3 Changes

### Change #1: Add Script (1 line)
```
Line ~205: Same as index.html
  ┌─────────────────────────────────────────┐
  │ <script src="js/app.js"></script>      │
  │ <script src="js/dom-utils.js"></script>│ ← ADD THIS
  │ <script>                                │
  └─────────────────────────────────────────┘
```

### Change #2: Replace renderTransactionList (whole function)
```
Line ~360: Find and replace this function:
  ┌──────────────────────────────────────────────┐
  │ function renderTransactionList() {          │
  │   if (transactions.length === 0) {          │
  │     container.innerHTML = `...`             │ ← UNSAFE
  │   }                                          │
  │   container.innerHTML = transactions.map... │ ← UNSAFE
  │ }                                            │
  └──────────────────────────────────────────────┘

Replace with safe version (see guide)
```

### Change #3: Replace renderAssetsList (whole function)
```
Line ~445: Find and replace this function:
  ┌──────────────────────────────────────────┐
  │ function renderAssetsList() {           │
  │   if (assets.length === 0) {            │
  │     container.innerHTML = `...`          │ ← UNSAFE
  │   }                                      │
  │   let html = '';                         │
  │   html += `<h4...>${categoryLabels...   │ ← UNSAFE
  │   container.innerHTML = html;            │ ← UNSAFE
  │ }                                        │
  └──────────────────────────────────────────┘

Replace with safe version (see guide)
```

---

## 📄 rebalance.html - 3 Changes

### Change #1: Add Script (1 line)
```
Line ~542: Same as others
  ┌─────────────────────────────────────────┐
  │ <script src="js/app.js"></script>      │
  │ <script src="js/dom-utils.js"></script>│ ← ADD THIS
  │ <script>                                │
  └─────────────────────────────────────────┘
```

### Change #2: Replace renderCurrentAllocation (whole function)
```
Line ~620: Find and replace
  ┌────────────────────────────────────────────┐
  │ function renderCurrentAllocation() {      │
  │   if (!portfolioData ...) {               │
  │     container.innerHTML = `               │ ← UNSAFE
  │       <div class="no-assets-message"...  │
  │     `;                                     │
  │   }                                        │
  │   container.innerHTML = `                 │ ← UNSAFE
  │     <div class="allocation-card...        │
  │   `;                                       │
  │ }                                          │
  └────────────────────────────────────────────┘

Replace with safe version (see guide)
```

### Change #3: Replace renderResults (whole function - BIGGEST)
```
Line ~960: This is the LONGEST function to replace
  ┌────────────────────────────────────────┐
  │ function renderResults(diffs, ...) {  │
  │   let html = '';                       │
  │   html += `                            │ ← DELETE
  │     <div class="result-category">     │   ALL
  │       ...100+ lines...                 │   OF
  │     </div>                             │   THIS
  │   `;                                   │
  │   resultsContent.innerHTML = html;    │ ← UNSAFE
  │ }                                      │
  └────────────────────────────────────────┘

Replace with safe version (see guide) - uses DOMUtils
```

---

## 🎯 Quick Check - What You Should See

### ✅ BEFORE Changes (Unsafe):
```javascript
// ❌ UNSAFE PATTERN - You'll see this:
container.innerHTML = `
  <div class="asset-name">${asset.name}</div>
`;

// ❌ UNSAFE PATTERN - And this:
let html = '';
assets.forEach(a => {
  html += `<div>${a.name}</div>`;
});
container.innerHTML = html;
```

### ✅ AFTER Changes (Safe):
```javascript
// ✅ SAFE PATTERN - You should see this:
DOMUtils.showEmptyState(container, 'No assets');

// ✅ SAFE PATTERN - Or this:
const element = DOMUtils.createElement('div', {
  text: asset.name  // ← Uses textContent, not innerHTML
});
container.appendChild(element);

// ✅ SAFE PATTERN - Or this:
const item = DOMUtils.createAssetItem(asset);
container.appendChild(item);
```

---

## 🔍 Search Tips in Your Editor

Use your editor's search (Ctrl+F or Cmd+F) to find:

### Find unsafe patterns:
```
Search for: container.innerHTML = `
Results: Should find multiple - REPLACE THESE
```

```
Search for: .innerHTML = sorted.map
Results: Should find in index.html - REPLACE THIS
```

```
Search for: html += `
Results: Should find in admin.html & rebalance.html - REPLACE THESE
```

### After changes, verify safety:
```
Search for: DOMUtils
Results: Should find multiple instances ✅

Search for: .innerHTML = `
Results: Should only find in non-critical places (like tooltip HTML)

Search for: textContent
Results: Should find multiple instances ✅
```

---

## 📊 Progress Tracker

Copy this checklist:

```
PROGRESS CHECKLIST:
═══════════════════════════════════════

Files to Update:
├─ index.html
│  ├─ [ ] Add dom-utils.js script (~line 340)
│  └─ [ ] Replace updateAssetsList (~line 370)
│
├─ admin.html
│  ├─ [ ] Add dom-utils.js script (~line 205)
│  ├─ [ ] Replace renderTransactionList (~line 360)
│  └─ [ ] Replace renderAssetsList (~line 445)
│
└─ rebalance.html
   ├─ [ ] Add dom-utils.js script (~line 542)
   ├─ [ ] Replace renderCurrentAllocation (~line 620)
   └─ [ ] Replace renderResults (~line 960)

Testing:
├─ [ ] Open index.html - assets display correctly
├─ [ ] Open admin.html - assets display correctly
├─ [ ] Open rebalance.html - calculator works
├─ [ ] Test XSS: Add asset with <script> in name
└─ [ ] Check console - no errors

═══════════════════════════════════════
```

---

## ⏱️ Time Estimate

| Task | Time |
|------|------|
| Backup files | 2 min |
| index.html (2 changes) | 3 min |
| admin.html (3 changes) | 5 min |
| rebalance.html (3 changes) | 5 min |
| Testing | 3 min |
| **TOTAL** | **~18 min** |

---

## 🆘 Emergency Rollback

If anything breaks:

```bash
# Restore from backup
cp index.html.backup index.html
cp admin.html.backup admin.html
cp rebalance.html.backup rebalance.html

# Then refresh browser
Ctrl + Shift + R  (Windows/Linux)
Cmd + Shift + R   (Mac)
```

---

## ✨ Success Indicators

After all changes, you should:

1. **See assets display normally** - No visual changes to user
2. **No console errors** - F12 → Console should be clean
3. **XSS test passes** - Asset name with `<script>` shows as text, not executed
4. **DOMUtils available** - Type `DOMUtils` in console, should see object

---

Ready to go! Start with `index.html` (easiest), then `admin.html`, then `rebalance.html`. 

**Remember:** One file at a time, test after each file! 🎯