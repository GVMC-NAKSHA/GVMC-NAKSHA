// components/LayerToggles.tsx
type Layers = Record<string, boolean>;
export function LayerToggles({ value, onChange }: { value: Layers; onChange: (v: Layers) => void }) {
  return (
    <fieldset className="layer-toggles">
      <legend>Layers</legend>
      {Object.keys(value).map(k => (
        <label key={k}>
          <input type="checkbox" checked={value[k]}
                 onChange={e => onChange({ ...value, [k]: e.target.checked })} />
          {k.replace(/_/g, ' ')}
        </label>
      ))}
    </fieldset>
  );
}
