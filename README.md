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
- **From now on.** With *This chat only* you can turn on *From now on*: older messages keep the older outfit and only messages after the change show the new one (by each message's send time; the chat file is not touched). *History* lists the changes in this chat and lets you delete a wrong one. A branched chat starts with the outfits and history of the chat it came from.
- **Change words (automatic).** Give an outfit words like "suit, tie". When an AI reply uses one, the look changes from that reply on (older messages keep their outfit). Words on a drawer pick a random outfit inside it (nothing changes if one from that drawer is already worn). English matches whole words ("suit" does not match "suitcase"); Korean matches inside words, so particles are fine. A word right next to "take off", "without", "벗", "대신" and the like is ignored (the list can be edited in ⚙). A short notice appears; tap it to undo. A swipe or regenerate checks the new reply again.
- **Random.** 🎲 picks a random outfit from the open drawer tab, from now on in this chat. *Random each reply* does it for every new AI reply in this chat (a swipe picks again, so the history does not pile up).
- Automatic changes change the picture only (the AI is not told) and, by default, do not change the matching-set partner (a switch in ⚙ turns that on). Each chat keeps the last 200 changes per character/persona.
- **In the chat.** Turn on *🧍 In the chat* in the wardrobe to place the picture of the current outfit over the chat (character and persona; it follows outfit changes). Drag it anywhere below the top bar — on a PC also into the empty space beside the chat. The input bar always stays on top, so a picture moved down looks like it stands behind it. A transparent-background full-body picture works best; *Sticker* (round cut, white border) suits pictures with a background. Pinch it (PC: mouse wheel) to resize, or tap it and drag the small handle on its corner. Turn it freely: twist with two fingers, Shift + mouse wheel on a PC, or tap it and drag the round handle above it; the tap bar also has a turn slider and 90° buttons (0°, 90° and 180° snap a little). Tapping also gives opacity, 🔒 *Lock*, *Hide* and *Remove*. A locked picture lets touches through to the chat; a hidden one leaves a small tab at the edge. **📌 Pinned pictures:** in *Style*, pin any outfit pictures (up to 6) into the current chat. They show only in that chat and don't change when you change outfits; each has its own place, size and turn. *Save this layout* keeps the pinned pictures of a chat by name, to load into another chat of the same character. Phones and PCs keep their own place, size and turn. Off for every character until you turn it on; ⚙ can turn all of them off and hide them while the phone keyboard is open.
- **Tell the AI.** Each outfit has a *look description* (e.g. "black suit, hair slicked back"). When you change into an outfit with a different description (picked with *This chat only*), it is sent through SillyTavern's extension prompt for the next few AI replies (1 / 3 / 5 / every time, in ⚙). The short "just changed" note goes near the end of the chat (depth 2) so the cached part of the prompt stays the same; *every time* goes after the character description. The wardrobe shows whether it is being sent; use *Not this time* if you only changed the picture, or *Tell again* if the AI seems to forget. Empty description = picture only. A *Whole character* pick changes the picture only. Off by default.
- **Where it shows:** chat message avatars, and the character list, character info page and welcome-screen recent chats (each group can be turned off). Only what is shown on screen changes; the card's own avatar is never replaced.
- **Backup and import** to move to another device (picture files can be included).
- **Leftover outfits.** If a character or persona was deleted while Facets was off (or on another device), its outfits stay behind. Outside a chat, the wardrobe shows a *Clean up* line: delete them, or *Move* them to a character/persona that has no outfits yet (handy if you renamed one while Facets was off). Pictures Facets uploaded that no outfit uses can be deleted there too.
- **Delete all Facets data** removes every picture Facets uploaded and all Facets settings.
- English and Korean. Starts in SillyTavern's language (Korean, otherwise English); change it in ⚙ or in Extensions → Facets.

## Install

1. In SillyTavern, open **Extensions** → **Install extension**.
2. Paste `https://github.com/Near7707/Facets` and install.

## Use

- **Wand menu → Facets.** In a one-on-one chat it opens for that chat; anywhere else it opens with character/persona pickers (whole-character looks only). **Extensions → Facets → Open Wardrobe** does the same.
- **Add** (bottom of the wardrobe, or in Organize) → crop each picture (or *Skip*). Going back or closing keeps the remaining pictures with the automatic crop. In **Organize**, drag the handle to reorder, tap 🗑 to delete an outfit, or tap the outfit to edit its name, look description, drawers, crop and matching set. The **Drawers** button makes, renames and deletes drawers (deleting a drawer keeps its outfits).
- ⚙ inside the wardrobe: where to show (including *In the chat*), *Tell the AI*, language, backup, delete all data, version.

**Tip — avatar shape.** SillyTavern's chat avatars are small. In **User Settings → Theme → Avatars**, *Square* or *Rounded* shows more of the picture than *Circle*. With *Rectangle*, Facets crops tall (2:3). If you change the avatar shape later, pictures cropped for the old shape may be cut a little — just crop those outfits again.

## How it stores data (and what it never touches)

- Outfit lists, per-chat choices and matching sets are saved in **Facets' own extension settings**.
- Pictures go to `user/images/Facets_<character>/` through SillyTavern's image API. Facets keeps a list of every file it uploaded, and *Delete all Facets data* deletes only those.
- Facets **does not** patch `window.fetch`, and **does not** write anything into character cards, chat files or chat metadata.
- Character rename/delete, persona delete, and chat rename/delete are followed through SillyTavern's events.

## Known limits

- Exporting a character card does not carry its outfits. Use Facets' backup to move them.
- Group chats are not supported yet (also no *In the chat* pictures there).
- *Whole character* replaces the per-chat choices and change histories of that character in every chat.
- Very old messages without a send time show the current outfit.
- *In the chat* pictures sit above the messages (not behind the text). Lower the opacity, or lock the picture so touches pass through.
- Deleting a character deletes its outfit pictures, but the empty `Facets_<character>` folder stays (SillyTavern only lets extensions delete files). Delete the folder yourself if you like.

## Testing without SillyTavern

`python3 test/server.py 8123 /path/to/SillyTavern/public` then open `http://localhost:8123/` (`?theme=light`, `?lang=ko`, `?nochat=1`).
The SillyTavern path is optional; it only adds SillyTavern's real CSS.

## License

AGPL-3.0
