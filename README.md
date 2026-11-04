# App Funnel

A single-page dashboard for job applications. Drop in tracker CSVs and it shows your funnel.

- Open `index.html` in a browser, then drop a Simplify and/or ApplyTwin export onto it.
- **Only real applications count.** Saved, skipped and unfinished rows are left out.
- **Duplicates are combined** across both files and within each one, using the posting ID in the job link.
- **What's new:** each new upload lists new applications and status changes since the previous upload.
- **Edit statuses** for updates your tracker doesn't have yet.
- Everything runs in your browser. Data is kept only in `localStorage`.

The full spec is in `.plans/job-application-visualizer-spec.md`.
