import { STORY_SONGS, TRACK_SONGS, TRANSCRIBED, songTitles } from '../audio/songs';
import { ACTS } from '../core/story';
import { CUPS, TRACK_LIST } from '../tracks/index';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The credits: the band and the song behind each track, the recordings the remixes were written from, and what the game is made with. */
export function creditsHtml(): string {
  const cups = CUPS.map((cup) => {
    const rows = cup.tracks
      .map((i) => {
        const t = TRACK_LIST[i];
        const song = TRACK_SONGS[t.id];
        if (!song) return '';
        const sampled = TRANSCRIBED[t.id] ? '<span class="credits-tag">from their recording</span>' : '';
        return `<li><span class="credits-track">${esc(t.name)}</span><span class="credits-song">${esc(songTitles(song))} <small>${esc(song.album)}, ${song.year}</small>${sampled}</span></li>`;
      })
      .join('');
    return `<div class="settings-group">${esc(cup.name)}</div><ul class="credits-list">${rows}</ul>`;
  }).join('');
  // Story mode's chapters, and the songs of theirs its races play live.
  const chapters = ACTS.map((a, i) => {
    const songs = STORY_SONGS[i] ?? [];
    // Any song from another album says which.
    const titles = songs.map((s) => `${esc(s.title)}${s.album !== songs[0].album ? ` (${esc(s.album)})` : ''}`).join(', ');
    return `<li><span class="credits-track">${esc(a.chapter)}: ${esc(a.title)}</span><span class="credits-song">${titles} <small>${esc(songs[0]?.album ?? '')}, ${songs[0]?.year ?? ''}</small></span></li>`;
  }).join('');
  const samples = Object.entries(TRANSCRIBED)
    .map(([id, s]) => {
      const t = TRACK_LIST.find((x) => x.id === id);
      return `<li><span class="credits-track">${esc(t?.name ?? (id === 'title' ? 'Title and menus' : id))}</span><span class="credits-song">${esc(s.recording)} <small>${esc(s.release)}</small></span></li>`;
    })
    .join('');
  return `
    <div class="credits-body">
      <p class="credits-lead">GizzRacer is an unofficial fan game, made with love for <b>King Gizzard &amp; the Lizard Wizard</b> and their fans. Every track is themed on one of their songs.</p>
      ${cups}
      <div class="settings-group">Story</div>
      <ul class="credits-list">${chapters}</ul>
      <div class="settings-group">The band's own recordings</div>
      <p class="credits-note">These remixes are transcribed from the band's recordings, releases they put out for anyone to use (kinggizzardandthelizardwizard.com/bootlegger), and played in seqbaby</p>
      <ul class="credits-list">${samples}</ul>
      <div class="settings-group">Music</div>
      <p class="credits-note">Written and remixed in seqbaby (playseqbaby.com)</p>
      <p class="credits-note">With Settings &gt; Soundtrack on Live, the music streams the band's live recordings (a race's song, or a whole show) from their shows on the Internet Archive's Live Music Archive (archive.org/details/KingGizzardAndTheLizardWizard), recorded by the fans who taped them. King Gizzard &amp; the Lizard Wizard let their shows be taped and shared</p>
      <div class="settings-group">Made with</div>
      <ul class="credits-list">
        <li><span class="credits-track">Lettering</span><span class="credits-song">Metal Mania by Open Window <small>SIL Open Font License</small></span></li>
        <li><span class="credits-track">3D</span><span class="credits-song">Three.js</span></li>
        <li><span class="credits-track">Online play</span><span class="credits-song">PartyKit and Cloudflare</span></li>
      </ul>
    </div>`;
}
