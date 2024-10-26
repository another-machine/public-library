# Lexicon Standoff

A party word game of hidden identities.

- 1/3 of players are randomly selected as imposters.
- All non-imposter players are shown the same two topics and must enter a single response based on a constraint that they associate with both topics.
- Imposters see the same two topics, plus one extra third topic. They must perform the same task without knowing which of the two topics everyone else sees.
- Once everyone has confirmed their response, they go around from slowest to fastest response and give their answer.
- Players discuss who might be an imposter and then place their vote on who they suspect.
- Players that guess correctly get one point, imposters that survive get two points.

The new static version of this game in this repo is still WIP. Older websocket versions are both currently offline.

Three (or more) devices enter in the player count, and choose a unique player. Devices use procedural generation to stay in sync. As long as the players progress the game together by starting rounds at the same time, devices will stay in sync. To make sure the devices are synced, you can open the menu and check your configuration at any time.
