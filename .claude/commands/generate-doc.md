Generate a Word-compatible HTML document from a live campaign in the database.

Supports two document types:
- **onboarding** — pre-fills any existing onboarding answers (objective, CTA, etc.) and lists each placement with date and a notes box for the client to fill in. Auto-detects newsletter vs. podcast based on the placements.
- **copy-review** — fills in the current copy for each placement, includes version, previous revision notes, destination link, and a response section (Approve / Revisions Needed + notes box).

## Steps

1. Ask the user which campaign they want to generate a doc for. Accept a name (partial match is fine), campaign ID, or portal ID.

2. Ask which document type: `onboarding` or `copy-review`.

3. Run the script:
```
npx tsx scripts/generate-doc.ts --campaign "<campaign name>" --type <onboarding|copy-review>
```
If they gave you an ID instead of a name, use `--id <id>` instead of `--campaign`.

4. The script will output the file path. Tell the user:
   - Where the file was saved (`output/<filename>.html`)
   - To open it in Word: **File → Open → select the file**, then save as `.docx` to get a proper Word document
   - Or open in a browser and **print to PDF** for a cleaner read-only version

5. If the script returns multiple matches, show the user the list and ask them to pick one by ID, then re-run with `--id`.

## Notes
- The script reads from the live database using `.env.local` credentials — make sure those are present.
- Output files go to the `output/` folder at the project root (created automatically).
- For onboarding docs, any answers already saved in the portal will be pre-filled in the document — useful if the client partially completed the form before losing access.
- For copy-review docs, only placements with copy are shown as "Ready for Review". Placements without copy show a "Copy Pending" notice.
