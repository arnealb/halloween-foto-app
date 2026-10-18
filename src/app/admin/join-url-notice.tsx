import {
  BLOCKING_JOIN_URL_WARNINGS,
  JOIN_URL_PROBLEM_MESSAGES,
  JOIN_URL_WARNING_MESSAGES,
  type JoinUrlResult,
} from "@/server/join-qr";

/**
 * The prominent warning when printed QR codes would be useless at the party:
 * PUBLIC_BASE_URL missing/invalid, not https, or a local address. A path in
 * the URL only gets a milder notice (the code still works). Renders nothing
 * for a good URL.
 */
export function JoinUrlNotice({ join }: { join: JoinUrlResult }) {
  const messages = join.ok
    ? join.warnings.map((warning) => JOIN_URL_WARNING_MESSAGES[warning])
    : [JOIN_URL_PROBLEM_MESSAGES[join.problem]];
  if (messages.length === 0) return null;
  const blocking = !join.ok || join.warnings.some((warning) => BLOCKING_JOIN_URL_WARNINGS.includes(warning));

  return (
    <div
      role="alert"
      className={`flex flex-col gap-2 rounded-2xl border-2 p-4 ${
        blocking ? "border-red-500 bg-red-950/60 text-red-50" : "border-amber-500 bg-amber-950/60 text-amber-50"
      }`}
    >
      <p className="text-lg font-bold">
        {!join.ok
          ? "Nog geen QR-code"
          : blocking
            ? "Niet afdrukken: deze QR-code werkt niet op het feest"
            : "Controleer PUBLIC_BASE_URL"}
      </p>
      {join.ok && (
        <p className="break-all text-sm">
          De code wijst naar <code className="font-semibold">{join.joinUrl}</code>.
        </p>
      )}
      <ul className="list-disc pl-5 text-sm">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
      <p className={`text-sm ${blocking ? "text-red-200" : "text-amber-200"}`}>
        Zet <code>PUBLIC_BASE_URL</code> op het publieke https-adres van de app (bv. de
        Vercel-URL) en herstart of deploy opnieuw.
      </p>
    </div>
  );
}

/** The QR code inline, from the SVG that `joinQrSvg` generated on the server. */
export function QrSvg({ svg, label, className }: { svg: string; label: string; className?: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className={`[&>svg]:block [&>svg]:size-full ${className ?? ""}`}
      // Our own markup from `qrcode` (no user input in it but the URL as modules).
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
