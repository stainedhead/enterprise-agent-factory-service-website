import type { StorageClassRecord } from "../../../../application/ports/agents.js";
import { Card, FormField, SelectInput, TextInput } from "../../../components/index.js";
import type { SectionProps } from "./types.js";

const ON_DELETE = [
  { value: "snapshot_then_delete", label: "Take a final snapshot, then delete the volume" },
  { value: "delete", label: "Delete the volume" },
  { value: "retain", label: "Keep the volume" },
];
const SCHEDULE = [
  { value: "off", label: "Off" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

/** *Persistent storage*: size, class (fixed after creation), on-delete behaviour and snapshot backups. */
export function StorageSection({
  draft,
  set,
  errors,
  classes,
  noOff = false,
}: SectionProps & { classes: readonly StorageClassRecord[]; noOff?: boolean }) {
  return (
    <Card title="Persistent storage">
      <FormField
        label="Size (GiB)"
        hint="1 to 1000. Can be expanded later, never shrunk."
        error={errors["volume.sizeGiB"]}
      >
        <TextInput
          inputMode="numeric"
          value={draft.sizeGiB}
          onChange={(e) => set({ sizeGiB: e.target.value })}
        />
      </FormField>
      <FormField
        label="Storage class"
        hint="Offered by your service admins. Fixed after creation."
        error={errors["volume.storageClass"]}
      >
        <SelectInput
          value={draft.storageClass}
          options={classes
            .filter((c) => c.enabled)
            .map((c) => ({
              value: c.name,
              label: c.description ? `${c.name} · ${c.description}` : c.name,
            }))}
          onChange={(e) => set({ storageClass: e.target.value })}
        />
      </FormField>
      <FormField label="When the agent is deleted" error={errors["volume.onDelete"]}>
        <SelectInput
          value={draft.onDelete}
          options={ON_DELETE}
          onChange={(e) => set({ onDelete: e.target.value })}
        />
      </FormField>
      <FormField label="Snapshot backups" error={errors["volume.snapshotSchedule"]}>
        <SelectInput
          value={draft.snapshotSchedule}
          options={noOff ? SCHEDULE.filter((o) => o.value !== "off") : SCHEDULE}
          onChange={(e) => set({ snapshotSchedule: e.target.value })}
        />
      </FormField>
      {draft.snapshotSchedule !== "off" && (
        <FormField label="Snapshots to keep" error={errors["volume.snapshotRetain"]}>
          <TextInput
            inputMode="numeric"
            value={draft.snapshotRetain}
            onChange={(e) => set({ snapshotRetain: e.target.value })}
          />
        </FormField>
      )}
    </Card>
  );
}
