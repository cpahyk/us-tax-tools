export const notificationLabels: Record<string, string> = {
  message: "New message",
  organizer_sent: "New organizer ready",
  organizer_started: "Client started their organizer",
  organizer_submitted: "Organizer submitted for review",
  organizer_reviewed: "Organizer review completed",
  changes_requested: "Changes requested on your organizer",
  organizer_updated: "Organizer updated",
};

export function notificationContent(kind: string, organizerId: string, forClient: boolean, siteUrl: string) {
  const origin = new URL(siteUrl);
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('Invalid portal URL');
  const path = `/${forClient ? 'portal' : 'dashboard'}/organizers/${organizerId}`;
  const subject = notificationLabels[kind] ?? "Organizer notification";
  return { subject, text: `${subject}. Sign in to your secure portal to view the details.\n\n${new URL(path, origin.origin).href}` };
}
