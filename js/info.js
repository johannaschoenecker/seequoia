// Info tab. Plain HTML so it is trivial to edit. Search for [[ ]] for the
// one placeholder that still needs your details.

export function html() {
  return `
<h2>Se(e)quoia?</h2>
<p>This map started as a citizen-science project to record every giant sequoia in
Cambridge (UK), and is growing to cover the whole of the British Isles. The name
is a play on words: it is the place you go to <em>see sequoias</em>. They are
beautiful trees, and surprisingly many of them are hiding in plain sight in
parks, college gardens, cemeteries and old estates.</p>

<h3>How to take part</h3>
<ol>
  <li>Find a giant sequoia. Check the identification tips below - Wellingtonia,
      coast redwood and dawn redwood are easily confused.</li>
  <li>On the <b>Map</b> tab, tap <b>+ Add a tree</b> and place the pin where the
      trunk stands (drag it to fine-tune). If the tree is on private land, put the
      pin where you saw it from and say so in the notes.</li>
  <li>Give it a name or label, say how the public can reach it, add a photo if you
      can, and submit. You will be asked to sign in with a Google account the first
      time - that is only so that we can tell submissions apart and stop spam.</li>
  <li>Every submission is checked by hand before it appears on the public map.
      You can follow the status of your own trees on the <b>Trees</b> tab.</li>
</ol>

<div class="callout">
  <p><b>Private land.</b> Please do not enter private property to photograph a
  tree. Record what you can see from a public path or road, and pick
  "Visible from a public path" as the access type.</p>
</div>

<h3>What is worth recording</h3>
<ul>
  <li><b>Girth</b> at 1.3 m above the ground (chest height) with a tape, in cm.
      This is the standard measurement and lets us estimate age and volume.</li>
  <li><b>Height</b> is hard to judge; a rough estimate is fine, or leave it blank.</li>
  <li><b>Condition</b>: lightning strikes, storm damage and crown dieback are all
      interesting - sequoias in the UK are only 150 years into what could be a
      3,000-year life.</li>
  <li><b>A photo</b> showing the whole tree, plus a close-up of the foliage if the
      identification is uncertain.</li>
</ul>

<img src="images/sequoia-seki.jpg" alt="Giant sequoia in Sequoia National Park, California" loading="lazy">

<h2>Giant sequoia (<em>Sequoiadendron giganteum</em>)</h2>
<p>The giant sequoia is the only living species in the genus
<em>Sequoiadendron</em>, native only to about 75 groves on the western slopes of
California's Sierra Nevada. By volume it is the largest tree on Earth: General
Sherman, the biggest, holds roughly 1,500 m³ of wood in a trunk over 11 m
across at the base. The bark is spongy, fibrous and cinnamon-red, up to 60 cm
thick, and the foliage is made of small, scale-like, awl-shaped needles pressed
against the shoots.</p>

<h3>Identifying sequoias in the UK</h3>
<ul>
  <li><b>Giant sequoia / Wellingtonia</b> - the tree this map is about. Broadly
      conical, very thick soft red bark you can punch without hurting yourself,
      short scale-like needles spiralling around the shoot, and small egg-shaped
      cones (4-7 cm) that stay closed for years.</li>
  <li><b>Coast redwood</b> (<em>Sequoia sempervirens</em>) - flat, yew-like needles
      in two rows, harder bark, smaller cones. Prefers milder, wetter places.</li>
  <li><b>Dawn redwood</b> (<em>Metasequoia</em>) - deciduous! Soft feathery
      foliage that turns bronze and drops in autumn; opposite (paired) needles.</li>
  <li><b>Western red cedar</b> and <b>Lawson cypress</b> have flat sprays of
      foliage rather than spiralled needles.</li>
</ul>

<img src="images/sequoia-cone-seki.jpg" alt="Giant sequoia cone in Sequoia National Park, California" loading="lazy">

<h2>Giant sequoias in the UK: a short history</h2>
<p>Seeds first reached Britain in 1853, only a year after the species became known
to European botanists, during the Victorian craze for exotic trees. Britain's cool,
moist climate turned out to suit young sequoias remarkably well, and they grew
faster and with less stress here than in hotter, drier parts of Europe.</p>

<p>Many of the UK's oldest specimens were planted on Victorian estates, in arboreta
and in large gardens as statement trees, and named "Wellingtonia" in honour of the
Duke of Wellington, who had died the year before. Over 150 years later a good number
still stand and are among the largest trees in Britain by volume. Sequoias then
spread into public parks, botanic gardens, cemeteries, school and college grounds.
A 2024 study estimated that the UK now holds around half a million giant sequoias
- more individuals than survive in their native groves - although none is yet
close to the size of the Californian giants.</p>

<p>Beyond their history, UK sequoias are a living experiment: how does a
long-lived, fire-adapted tree from the Sierra Nevada fare far from home, and what
happens to it as the climate changes? Mapping where they are is the first step to
finding out.</p>

<h2>Data and privacy</h2>
<ul>
  <li>Tree locations, names, notes and photos that pass review are published on
      this map for anyone to see and reuse.</li>
  <li>Your Google account is used only to sign you in. Your email address is
      never shown on the map or stored with a verified tree. If you enter a name in
      the "credit" box, that is shown publicly with your tree.</li>
  <li>Your device's location is used only to centre the map and place the pin; it
      is not stored beyond the position of the tree you submit.</li>
  <li>Questions or removal requests: [[contact email]].</li>
</ul>

<p class="muted small">Photos on this page: giant sequoia and cone in Sequoia National Park,
California. Map data &copy; OpenStreetMap contributors; imagery &copy; Esri.</p>
`;
}
