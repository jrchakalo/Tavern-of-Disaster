import { roll } from '../diceService';

describe('diceService.roll', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function setRandomSequence(values: Array<{ value: number; die: number }>) {
    let index = 0;
    jest.spyOn(Math, 'random').mockImplementation(() => {
      if (index >= values.length) {
        // Reuse last value if more rolls are requested (should not happen in tests)
        return (values[values.length - 1].value - 0.999999) / values[values.length - 1].die;
      }
      const { value, die } = values[index++];
      return (value - 0.999999) / die;
    });
  }

  it('rolls a single die without modifier', () => {
    setRandomSequence([{ value: 12, die: 20 }]);
    const result = roll('1d20');
    expect(result.rolls).toHaveLength(1);
    expect(result.rolls[0]).toMatchObject({ value: 12, die: 20, kept: 'kept' });
    expect(result.modifier).toBe(0);
    expect(result.total).toBe(12);
    expect(result.expression).toBe('1d20');
  });

  it('applies modifiers correctly', () => {
    setRandomSequence([
      { value: 4, die: 6 },
      { value: 5, die: 6 },
    ]);
    const result = roll('2d6+3');
    expect(result.rolls).toHaveLength(2);
    expect(result.modifier).toBe(3);
    expect(result.total).toBe(4 + 5 + 3);
  });

  it('handles zero dice by returning only the modifier', () => {
    const result = roll('0d6');
    expect(result.rolls).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.metadata).toBe('zero-dice');
  });

  it('supports large dice within limits', () => {
    setRandomSequence([{ value: 1000, die: 1000 }]);
    const result = roll('1d1000-10');
    expect(result.rolls[0].value).toBe(1000);
    expect(result.total).toBe(990);
  });

  it('keeps highest dice when kh is used', () => {
    setRandomSequence([
      { value: 6, die: 6 },
      { value: 5, die: 6 },
      { value: 4, die: 6 },
      { value: 1, die: 6 },
    ]);
    const result = roll('4d6kh3');
    const kept = result.rolls.filter(r => r.kept === 'kept');
    expect(kept).toHaveLength(3);
    expect(kept.map(r => r.value).sort()).toEqual([4, 5, 6]);
    expect(result.total).toBe(4 + 5 + 6);
  });

  it('keeps lowest dice when kl is used', () => {
    setRandomSequence([
      { value: 6, die: 6 },
      { value: 2, die: 6 },
      { value: 3, die: 6 },
    ]);
    const result = roll('3d6kl1');
    const kept = result.rolls.filter(r => r.kept === 'kept');
    expect(kept).toHaveLength(1);
    expect(kept[0].value).toBe(2);
    expect(result.total).toBe(2);
  });

  it('applies advantage by keeping the highest die', () => {
    setRandomSequence([
      { value: 2, die: 20 },
      { value: 17, die: 20 },
    ]);
    const result = roll('1d20adv+5');
    const kept = result.rolls.filter(r => r.kept === 'kept');
    expect(result.rolls).toHaveLength(2);
    expect(kept).toHaveLength(1);
    expect(kept[0].value).toBe(17);
    expect(result.total).toBe(17 + 5);
  });

  it('applies disadvantage by keeping the lowest die', () => {
    setRandomSequence([
      { value: 18, die: 20 },
      { value: 4, die: 20 },
    ]);
    const result = roll('1d20dis-1');
    const kept = result.rolls.filter(r => r.kept === 'kept');
    expect(kept).toHaveLength(1);
    expect(kept[0].value).toBe(4);
    expect(result.total).toBe(4 - 1);
  });
});
