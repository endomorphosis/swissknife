# Missing Application Registrations

## Summary

6 applications have desktop icons in `web/index.html` but are **NOT registered** in `web/js/main-simple.js`, causing them to fail when clicked.

## Missing Applications

1. **calendar** - Calendar & Events
   - Icon: 📅 in HTML
   - Not registered in main-simple.js

2. **friends-list** - Friends & Network  
   - Icon: 👥 in HTML
   - Not registered in main-simple.js

3. **music-studio-unified** - Music Studio
   - Icon: 🎵 in HTML
   - Note: There IS a 'strudel' app registered, but HTML uses 'music-studio-unified'
   - Icon click will fail because name mismatch

4. **p2p-chat-unified** - P2P Chat
   - Icon: 💬 in HTML
   - Not registered in main-simple.js
   - This is one of the apps claimed to be fixed in PR #22!

5. **peertube** - PeerTube Video Player
   - Icon: 📺 in HTML
   - Not registered in main-simple.js

6. **todo** - Todo & Goals
   - Icon: 📋 in HTML
   - Not registered in main-simple.js

## Impact

When users click these 6 desktop icons, they will see:
```
App <name> not found
```

And no window will open.

## Required Fix

Add these applications to the `initializeApps()` method in `web/js/main-simple.js`:

```javascript
this.apps.set('calendar', {
    name: 'Calendar & Events',
    icon: '📅',
    component: 'CalendarApp',
    singleton: true
});

this.apps.set('friends-list', {
    name: 'Friends & Network',
    icon: '👥',
    component: 'FriendsListApp',
    singleton: true
});

this.apps.set('music-studio-unified', {
    name: 'Music Studio',
    icon: '🎵',
    component: 'MusicStudioUnifiedApp',
    singleton: false
});

this.apps.set('p2p-chat-unified', {
    name: 'P2P Chat',
    icon: '💬',
    component: 'P2PChatUnifiedApp',
    singleton: false
});

this.apps.set('peertube', {
    name: 'PeerTube',
    icon: '📺',
    component: 'PeerTubeApp',
    singleton: false
});

this.apps.set('todo', {
    name: 'Todo & Goals',
    icon: '📋',
    component: 'TodoApp',
    singleton: false
});
```

## Verification

After adding these registrations, verify that the corresponding component files exist in `web/js/apps/` directory.
