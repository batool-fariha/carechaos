import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="mt-2 text-mute">That experiment or page doesn&apos;t exist (it may have been deleted from history).</p>
      <Link href="/" className="mt-4 inline-block text-teal underline">Back to the dashboard</Link>
    </div>
  );
}
