/** Placeholder page for a screen that a later milestone builds. M6-X1 fails while any remain. */
export function NotBuiltYet({ screen }: { screen: string }) {
  return (
    <section aria-label={`${screen} not built yet`}>
      <h1>{screen}</h1>
      <p>This screen is not built yet.</p>
    </section>
  );
}
