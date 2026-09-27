# Advanced Weaponry ? Web DLC

Original DLC id: 4. Web package id: `advanced-weaponry`.
`1.0.0` is the Web port package version, not an inferred Flash release number.

Source: `decompiled/AdvancedWeaponry/scripts/AdvancedWeaponry.as`,
`AdvancedWeaponry/Texts.as`, exported images/sounds and symbolClass mappings.
The script below is a developer conversion tool for the decompiled original AS3,
not a mod installer. Ready-made web packages are discovered automatically from
their folders and need no package-specific import script.
Rebuild the data package from the repository root only when updating the port:

```
python web/scripts/import_advanced_weaponry.py
```

## Included
- Weapons 50?63, items 236?261, ammo 35?45, caliber 18, attachment 7.
- Original sprite dimensions/boundaries for Weapon36?38 and animation type 4.
- Original images (unchanged resolution), two MP3 sounds, 14 original localized texts.
- Workshop recipes 6?15, town 53 location 10, and all 61 onGameInit assortment additions.
- Existing-shop additions affect replenishment, not instant free stock. Original quantities are preserved.

## Enable / disable
Enabled by default in `mods/index.json`. The title-screen DLC menu offers enable/disable
with a reload; a reload is required to reconstruct data tables and cached resources.
Do not disable this DLC when continuing a save containing its weapons, ammunition or recipes.
The existing save mod-list mismatch warning remains in place; it does not convert DLC items
into base-game substitutes. No real player save was read or modified during implementation.

## Validation / limits
`node scripts/advanced_weaponry_regression.mjs` from `web` checks the real base data + package,
world construction, source shops, all frame entries, recipe dependencies, names, asset paths,
and disabled-package isolation. No real saves are used.
Browser combat animation, firing audio and complete shop/crafting interaction have not yet
been visually/aurally accepted. The DLC uses the Web engine's existing combat implementation;
this package does not claim to remove all pre-existing Web-vs-Flash ballistic differences.
