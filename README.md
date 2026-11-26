# Facets

**Facets** is a SillyTavern extension that gives each character and persona a *wardrobe*: keep several pictures ("outfits") and change them per chat or for the whole character.

An outfit doesn't have to be clothes — a time of day, a place, a season, an injury, an age or an art style can each be one outfit.

[한국어 설명은 아래에 있어요 → README.ko.md](README.ko.md)

## Features

- **Several outfits per character and persona.** Add many pictures at once; names come from the file names and you can fix them later.
- **Change in one tap.** Pick *This chat only* or *Whole character* once, then tap an outfit.
  - Every message avatar in the chat changes, including older messages.
  - *Whole character* applies to all of that character's chats, including new ones.
- **Default look** brings back the original avatar.
- **Crop first.** When you add pictures, each one opens in the crop screen (or tap *Skip* to use the automatic crop). Drag to move, and zoom *out* to fit the upper body (or more) into the small avatar. The frame follows SillyTavern's avatar shape: square for Circle/Square/Rounded, tall (2:3) for Rectangle. The chat shows the cropped picture; SillyTavern's zoomed avatar shows the full picture.
- **Matching sets.** Pair a character outfit with a persona outfit; changing one changes the other.
- **Drawers.** Group outfits into drawers such as "Casual" or "Formal" (one outfit can be in several). Drawer tabs filter the wardrobe; outfits added while a drawer tab is open go into that drawer.
- **Tell the AI.** Each outfit has a *look description* (e.g. "black suit, hair slicked back"). Descriptions of outfits picked with *This chat only* are sent as a reference through SillyTavern's extension prompt; a *Whole character* pick changes the picture only, so one description never spreads to every chat. If the story has the character change clothes, the story wins. Off by default — turn it on in the wardrobe.
- **Where it shows:** chat message avatars, and the character list, character info page and welcome-screen recent chats (each group can be turned off). Only what is shown on screen changes; the card's own avatar is never replaced.
- **Backup and import** to move to another device (picture files can be included).
- **Delete all Facets data** removes every picture Facets uploaded and all Facets settings.
- English and Korean. Starts in SillyTavern's language (Korean, otherwise English); change it in ⚙ or in Extensions → Facets.

## Install

1. In SillyTavern, open **Extensions** → **Install extension**.
2. Paste `https://github.com/Near7707/Facets` and install.

## Use

- **Wand menu → Facets.** In a one-on-one chat it opens for that chat; anywhere else it opens with character/persona pickers (whole-character looks only). **Extensions → Facets → Open Wardrobe** does the same.
- **Add** (bottom of the wardrobe, or in Organize) → crop each picture (or *Skip*). Going back or closing keeps the remaining pictures with the automatic crop. In **Organize**, drag the handle to reorder, tap 🗑 to delete an outfit, or tap the outfit to edit its name, look description, drawers, crop and matching set. The **Drawers** button makes, renames and deletes drawers (deleting a drawer keeps its outfits).
- ⚙ inside the wardrobe: where to show, *Tell the AI*, language, backup, delete all data, version.

**Tip — avatar shape.** SillyTavern's chat avatars are small. In **User Settings → Theme → Avatars**, *Square* or *Rounded* shows more of the picture than *Circle*. With *Rectangle*, Facets crops tall (2:3). If you change the avatar shape later, pictures cropped for the old shape may be cut a little — just crop those outfits again.

## How it stores data (and what it never touches)

- Outfit lists, per-chat choices and matching sets are saved in **Facets' own extension settings**.
- Pictures go to `user/images/Facets_<character>/` through SillyTavern's image API. Facets keeps a list of every file it uploaded, and *Delete all Facets data* deletes only those.
- Facets **does not** patch `window.fetch`, and **does not** write anything into character cards, chat files or chat metadata.
- Character rename/delete, persona delete, and chat rename/delete are followed through SillyTavern's events.

## Known limits

- Exporting a character card does not carry its outfits. Use Facets' backup to move them.
- Group chats are not supported yet.
- If a chat is branched, the copy starts without that chat's per-chat choice.
- Deleting a character deletes its outfit pictures, but the empty `Facets_<character>` folder stays (SillyTavern only lets extensions delete files). Delete the folder yourself if you like.

## Testing without SillyTavern

`python3 test/server.py 8123 /path/to/SillyTavern/public` then open `http://localhost:8123/` (`?theme=light`, `?lang=ko`, `?nochat=1`).
The SillyTavern path is optional; it only adds SillyTavern's real CSS.

## License

AGPL-3.0
