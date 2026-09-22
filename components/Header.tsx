export default function Header() {
  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-green-600 text-xl">
          🌿
        </div>
        <div>
          <h1 className="text-lg font-semibold leading-tight">PlantPal</h1>
          <p className="text-sm text-zinc-500">Jev gate vs. LLM gate</p>
        </div>
      </div>
    </header>
  );
}
