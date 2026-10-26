# Pinned LDCad Shadow Library data

This directory contains the LDCad Shadow Library, revision
`9b1131fb1991f8c0bfc072325e4e12f6271aba35`, from
<https://github.com/RolandMelkert/LDCadShadowLibrary>.

The source and derived metadata are licensed **CC BY-SA 4.0**. See
`LICENSE.md`. Attribution: LDCad Shadow Library contributors. The original
authors, history, license notices and comments remain in each source file.
`provenance.json` records the pinned revision and SHA-256 checksums.

`sources.json.gz` is deterministic gzip of a JSON map containing the original
`p/` and `parts/` DAT files. CRLF is normalized to LF; metadata is unchanged.
No code is executed from this archive. The generated metadata under
`public/catalog/shadow/` is a transformed interpretation of those source files,
also distributed under CC BY-SA 4.0.

## Regeneration and checks

Run `node scripts/compile-shadow-catalog.mjs` to regenerate resolved metadata
from the vendored snapshot, with no network dependency. Run the same command
with `--check` to compare the committed generated artifacts. Run
`node scripts/test-shadow-resolver.mjs` for adversarial fixtures and real parts.

To deliberately recreate the snapshot from an unmodified checkout of the
exact pinned revision, run:

```text
node scripts/compile-shadow-catalog.mjs --snapshot-from <checkout-directory>
```

The checked source hash, revision, file count and license hash are mandatory.
Changing an upstream revision requires an explicit source update and review.

## Interpretation and limits

The resolver traverses LDraw references, appends the corresponding shadow
metadata, applies ordered `SNAP_CLEAR`, and reads `SNAP_INCL` from shadow metadata
only. It does not import geometry from include targets. Nested chains such as
the real `3942bp01 -> 3942b -> 3942a` are retained as analysis candidates, but
always produce `nested_include_semantics_unverified` and `partial` coverage.
The public reference describes nonrecursive includes, and nested behavior has
not been independently validated against LDCad. These candidates must not be
enabled by an assembly adapter.

It expands oriented grids, including the 3D count/step form used by the pinned
source (`2205`, `2486`, `2541`). It checks transforms in each connector's local
frame, applies declared scale and mirror rules (`YandR` follows the documented
`YOnly` OR `ROnly` rule), and optionally converts LDraw
coordinates to Brickforge by inverting Y only. CYL cap `one` becomes A for male
and B for female. `center` remains explicit; the origin is not silently moved.

The public format reference is <https://www.melkert.net/LDCad/tech/meta>.
Some source features are newer than this page. Uninterpreted properties such
as generic `match`, generic `placement`, or `mirror=corZ` produce diagnostics;
they are not silently treated as understood. Malformed data, missing references,
cycles, shear and expansion limits fail closed. Deliberately suppressed scaling
or mirroring produces informational diagnostics, according to source policies.

`complete` means that the resolver understood the effective metadata. It does
**not** mean that a part can be assembled, that all physical connections are
present, or that placements are collision-free. `partial` means a feature or
source construct was not fully interpreted. `absent` means no effective
connectors and no unresolved source diagnostics. An assembly engine must
separately certify the supported connection shapes and collision geometry.

Per-part status is in `lib/shadow-catalog.json`; resolved profiles are in the
indexed gzip packs. `coverage.json` reports this metadata coverage separately
from any application assembly-support count. Each resolved connector retains
its source file/line, inheritance/include paths, grid index, raw parameters and
unsupported-feature list.
