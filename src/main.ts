// Entry point: the game, or with ?showroom every racer on a turntable.
if (new URLSearchParams(location.search).has('showroom')) {
  void import('./render/showroom').then((m) => m.startShowroom(document.getElementById('app')!));
} else {
  void import('./game');
}
