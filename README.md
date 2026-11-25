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
- **Fit to square.** Drag to move, and zoom *out* to fit the upper body (or more) into the small avatar. The chat shows the square; SillyTavern's zoomed avatar shows the full picture.
- **Matching sets.** Pair a character outfit with a persona outfit; changing one changes the other.
- **Tell the AI.** Each outfit has a *look description* (e.g. "black suit, hair slicked back"). The current descriptions are added to the prompt through SillyTavern's extension prompt (can be turned off).
- **Where it shows:** chat message avatars and the character list (each can be turned off).
- **Backup and import** to move to another device (picture files can be included).
- **Clean up data** removes every picture Facets uploaded and all Facets settings.
- English and Korean.

## Install

1. In SillyTavern, open **Extensions** → **Install extension**.
2. Paste `https://github.com/Near7707/Facets` and install.

## Use

- In a one-on-one chat: **wand menu → Open Wardrobe**.
- Without a chat: **Extensions → Facets → Open Wardrobe** (organize outfits, or change the look for the whole character).
- **Organize** → **Add outfits** to upload. Drag the handle to reorder; tap an outfit to edit its name, look description, square crop, matching set, or to delete it.
- ⚙ inside the wardrobe: where to show, *Tell the AI*, language, backup, clean up, version.

**Tip — avatar shape.** SillyTavern's chat avatars are small. In **User Settings → Theme → Avatars**, *Square* or *Rounded* shows more of the picture than *Circle*. *Rectangle* cuts the sides off square pictures.

## How it stores data (and what it never touches)

- Outfit lists, per-chat choices and matching sets are saved in **Facets' own extension settings**.
- Pictures go to `user/images/Facets_<character>/` through SillyTavern's image API. Facets keeps a list of every file it uploaded, and *Clean up data* deletes only those.
- Facets **does not** patch `window.fetch`, and **does not** write anything into character cards, chat files or chat metadata.
- Character rename/delete, persona delete, and chat rename/delete are followed through SillyTavern's events.

## Known limits

- Exporting a character card does not carry its outfits. Use Facets' backup to move them.
- Group chats are not supported yet.
- If a chat is branched, the copy starts without that chat's per-chat choice.
- With SillyTavern's zoom magnifier on, the magnifier may show the default picture.

## Testing without SillyTavern

`python3 test/server.py 8123 /path/to/SillyTavern/public` then open `http://localhost:8123/` (`?theme=light`, `?lang=ko`, `?nochat=1`).
The SillyTavern path is optional; it only adds SillyTavern's real CSS.

## License

AGPL-3.0
