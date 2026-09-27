"""Repack the extracted original TTF without altering glyphs (requires fonttools)."""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen

folder = Path(__file__).resolve().parents[1] / 'public/assets/fonts'
source = next(folder.glob('1134_*.ttf'))
target = folder / 'DroidSansMonoCaravaneer.web.ttf'
original = TTFont(source, recalcTimestamp=False)
# Force all tables to decompile so padding/trailing garbage is not copied through.
for tag in original.keys():
    original[tag]
original.save(target)
repacked = TTFont(target, recalcTimestamp=False)
assert original.getBestCmap() == repacked.getBestCmap()
assert original['hmtx'].metrics == repacked['hmtx'].metrics
for name in original.getGlyphOrder():
    a, b = RecordingPen(), RecordingPen()
    original.getGlyphSet()[name].draw(a)
    repacked.getGlyphSet()[name].draw(b)
    assert a.value == b.value, name
print(f'PASS: {len(original.getGlyphOrder())} glyph outlines and advances unchanged; {target.name}')
