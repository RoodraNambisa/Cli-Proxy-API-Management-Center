import {act,renderHook} from '@testing-library/react';
import {describe,it,expect} from 'vitest';
import {parse} from 'yaml';
import {useVisualConfig,getVisualConfigValidationErrors} from './useVisualConfig';

describe('Codex state settings integration',()=>{
  it('does not enable or write state settings on unrelated edits',()=>{
    const {result}=renderHook(()=>useVisualConfig());
    act(()=>result.current.loadVisualValuesFromYaml('codex:\n  observe-quota: true\n'));
    expect(result.current.visualValues.codexStateOverride.enabled).toBe(false);
    act(()=>result.current.setVisualValues({debug:true}));
    expect(parse(result.current.applyVisualChangesToYaml('codex:\n  observe-quota: true\n')).codex['state-override']).toBeUndefined();
  });
  it('saves settings independently and rejects a conflicting strip policy',()=>{
    const source='codex:\n  turn-state-policy: strip\n  state-override:\n    enabled: false\n    extension: retained\n';
    const {result}=renderHook(()=>useVisualConfig());act(()=>result.current.loadVisualValuesFromYaml(source));
    act(()=>result.current.setVisualValues({codexStateOverride:{...result.current.visualValues.codexStateOverride,enabled:true,models:'gpt-6-astra',priorities:'0, 3','max-attempts':'3'}}));
    expect(getVisualConfigValidationErrors(result.current.visualValues).codexStateOverride).toBe('codex_state_override');
    act(()=>result.current.setVisualValues({codexTurnStatePolicy:'guard-cross-account'}));
    const output=result.current.applyVisualChangesToYaml(source);
    expect(parse(output).codex['state-override']).toMatchObject({enabled:true,models:['gpt-6-astra'],priorities:[0,3],'max-attempts':3,extension:'retained'});
    act(()=>result.current.loadVisualValuesFromYaml(output));expect(result.current.visualDirty).toBe(false);
  });
});
