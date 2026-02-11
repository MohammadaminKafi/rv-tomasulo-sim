# RISC-V Pipeline + Tomasulo Simulator

Browser-based (static) simulator for teaching classic pipelining and out-of-order execution.

Live (GitHub Pages): https://mohammadaminkafi.github.io/rv-tomasulo-sim/

## Run / Deploy

```bash
sudo docker compose up
```

Then open: http://localhost:3001

## Execution modes (specs)

The UI lets you switch modes from the “Mode” dropdown. Each mode’s behavior is specified in `/docs`:

- 5-Stage Pipeline: `docs/PIPELINE_SPECIFICATION.md`
- Tomasulo (no speculation): `docs/TOMASULO_SPECIFICATION.md`
- Tomasulo + Speculation (ROB, recovery): `docs/SPECULATION_SPECIFICATION.md`

## Sample programs

Samples are static files served by Vite:

- Assembly files: `public/samples/*.asm`
- Sample list/metadata: `public/samples/samples.json`

To add a new sample:

1. Add a new `public/samples/<your-sample>.asm` file.
2. Add an entry to `public/samples/samples.json` with a unique `id` and a `codePath` like `samples/<your-sample>.asm`.

The app loads `samples.json` at runtime and then fetches each referenced `.asm` file.

## Notes

- This project is a static frontend (no backend). The `vite.config.ts` base path is set for GitHub Pages.