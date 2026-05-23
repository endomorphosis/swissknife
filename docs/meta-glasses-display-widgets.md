# Meta Glasses Display Widgets

Swissknife display widgets are authored as MCP++ UI descriptors with the
`handsfree.meta-glasses/display-widget` extension. The Swissknife CLI compiles
those descriptors into deterministic display manifests and local mobile action
envelopes, so developers do not edit Android or iOS native code while authoring
or testing widgets.

## CLI

Use the `meta-glasses widget` command group:

```bash
swissknife meta-glasses widget gallery
swissknife meta-glasses widget init --template task-progress --output task.widget.json
swissknife meta-glasses widget lint --descriptor task.widget.json --state-file task.widget.state.json
swissknife meta-glasses widget compile --descriptor task.widget.json --state-file task.widget.state.json --output task.manifest.json
swissknife meta-glasses widget preview --manifest task.manifest.json --output task.preview.html
swissknife meta-glasses widget publish --descriptor task.widget.json --state-file task.widget.state.json --output task.publish.json
swissknife meta-glasses widget invoke --descriptor task.widget.json --state-file task.widget.state.json --operation render_widget --output task.invoke.json
```

The `init` command writes a descriptor JSON file and a sample state JSON file.
The descriptor remains the source of truth; the compiler rejects unsafe display
geometry, unbounded text, missing focus order, unsupported media, unbound
actions, unsafe update rates, and missing native-display-unavailable fallback
coverage before any manifest is emitted.

## Authoring Flow

1. Start from a gallery descriptor:

```bash
swissknife meta-glasses widget init --template confirmation --output confirmation.widget.json
```

2. Edit the descriptor and state JSON. Keep UI content in descriptor/state
fields, not native mobile code.

3. Run lint after each descriptor change:

```bash
swissknife meta-glasses widget lint --descriptor confirmation.widget.json --state-file confirmation.widget.state.json
```

Failed lint output includes a `Why rejected:` section with stable validation or
compiler issue codes.

4. Compile a manifest:

```bash
swissknife meta-glasses widget compile --descriptor confirmation.widget.json --state-file confirmation.widget.state.json --output confirmation.manifest.json
```

5. Preview in a browser:

```bash
swissknife meta-glasses widget preview --manifest confirmation.manifest.json --output confirmation.preview.html
```

6. Publish a local developer-preview record:

```bash
swissknife meta-glasses widget publish --descriptor confirmation.widget.json --state-file confirmation.widget.state.json --output confirmation.publish.json
```

7. Invoke a display operation envelope:

```bash
swissknife meta-glasses widget invoke --descriptor confirmation.widget.json --state-file confirmation.widget.state.json --operation activate --action-id confirm
```

## Gallery

The bundled gallery covers the required widget shapes:

| Template | Layout | Operation focus | Example actions |
| --- | --- | --- | --- |
| `task-progress` | `task-progress` | Running task progress, status, and pause/dismiss controls | `pause`, `dismiss` |
| `confirmation` | `confirmation` | Policy-gated confirm/cancel prompt | `confirm`, `cancel` |
| `summary` | `notification-summary` | Inbox or notification summary with acknowledge/open controls | `open`, `dismiss` |
| `timer` | `status` | Countdown or elapsed timer with low-rate updates | `pause`, `reset`, `dismiss` |
| `media` | `media` | Image or short video preview with media contract metadata | `play`, `dismiss` |
| `checklist` | `list` | Checklist progress and next/done controls | `next`, `done` |
| `metric` | `freeform-grid` | Compact metric dashboard with refresh/dismiss controls | `refresh`, `dismiss` |

Every gallery descriptor exposes the required widget operations:

- `render_widget`
- `update_widget`
- `clear_widget`
- `focus_next`
- `focus_previous`
- `activate`
- `reset_session`
- `subscribe_updates`

The media gallery descriptor also exposes `play_video`.

## Publish And Invoke Outputs

`publish` writes a local record with:

- descriptor path
- interface CID
- widget CID
- compiled manifest
- trust policy name
- `native_code_required: false`

`invoke` writes or prints a mobile action envelope for the requested operation,
for example `mobile_render_display_widget`, `mobile_update_display_widget`,
`mobile_focus_display_widget`, or
`mobile_activate_display_widget_action`. These envelopes are suitable for the
hardware-free mobile bridge harness and can be forwarded by backend policy code
without adding native widget-specific branches.
