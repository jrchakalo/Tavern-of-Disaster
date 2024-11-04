import React, { useState, useEffect } from 'react';

const classes = [
  'Bárbaro', 'Bardo', 'Bruxo', 'Clérigo', 'Druida', 
  'Feiticeiro', 'Guerreiro', 'Ladino', 'Mago', 
  'Monge', 'Paladino', 'Ranger'
];

const hitDice = {
  'Bárbaro': 12,
  'Bardo': 8,
  'Bruxo': 8,
  'Clérigo': 8,
  'Druida': 8,
  'Feiticeiro': 6,
  'Guerreiro': 10,
  'Ladino': 8,
  'Mago': 6,
  'Monge': 8,
  'Paladino': 10,
  'Ranger': 10
};

type SpeciesType = {
  [key: string]: string[];
};

const species: SpeciesType = {
  'Anão': ['Anão da Colina', 'Anão da Montanha', 'Anão Cinzento (Duergar)'],
  'Elfo': ['Alto Elfo', 'Elfo da Floresta', 'Elfo Negro (Drow)'],
  'Halfling': ['Halfling Robusto', 'Halfling Pés Leves', 'Halfling Fantasma'],
  'Meio-Elfo': ['Descendência Elfo Alto', 'Descendência Elfo da Floresta', 'Descendência Elfo Negro', 'Descendência Elfo Aquatico'],
  'Draconato': ['Azul', 'Branco', 'Preto', 'Verde', 'Vermelho', 'Bronze', 'Cobre', 'Latão', 'Ouro', 'Prata'],
  'Gnomo': ['Gnomo da Floresta', 'Gnomo da Rocha', 'Gnomo da Profundeza'],
  'Meio-Orc': [],
  'Tiefling': [],
  'Humano': [],
  'Genasi': ['Genasi da Água', 'Genasi da Terra', 'Genasi do Ar', 'Genasi do Fogo'],
  'Aarakocra': [],
  'Golias': []
};

const backgrounds = [
    'Acólito', 'Charlatão', 'Criminoso', 'Artista', 'Herói do Povo', 
    'Artesão da Guilda', 'Eremita', 'Nobre', 'Forasteiro', 'Sábio', 
    'Marinheiro', 'Soldado', 'Órfão'
  ];

const CreateSheet: React.FC = () => {
  const [step, setStep] = useState(1);
  const [selectedClass, setSelectedClass] = useState<keyof typeof hitDice | ''>('');
  const [level, setLevel] = useState(1);
  const [hp, setHp] = useState(0);
  const [selectedSpecies, setSelectedSpecies] = useState('');
  const [selectedSubSpecies, setSelectedSubSpecies] = useState('');
  const [selectedBackground, setSelectedBackground] = useState('');

  useEffect(() => {
    if (selectedClass) {
      const baseHp = hitDice[selectedClass];
      const calculatedHp = baseHp + (level - 1) * (baseHp / 2 + 1);
      setHp(calculatedHp);
    }
  }, [selectedClass, level]);

  const handleNext = () => {
    if (step === 1 && !selectedClass) {
      alert('Please select a class');
      return;
    }
    if (step === 3 && (!selectedSpecies || !selectedSubSpecies)) {
      alert('Please select a species and sub-species');
      return;
    }
    if (step === 4 && !selectedBackground) {
      alert('Please select a background');
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    console.log('Sheet Created:', { selectedClass, level, hp, selectedSpecies, selectedSubSpecies, selectedBackground });
  };

  return (
    <div>
      <h1>Create New D&D Sheet</h1>
      <form onSubmit={handleSubmit}>
        {step === 1 && (
          <div>
            <h2>Choose Your Class <span style={{ color: 'red' }}>*</span></h2>
            <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value as keyof typeof hitDice)}>
              <option value="">Select a class</option>
              {classes.map((cls) => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          </div>
        )}
        {step === 2 && (
          <div>
            <h2>Set Level and HP</h2>
            <div>
              <label htmlFor="level">Level:</label>
              <button type="button" onClick={() => setLevel(Math.max(1, level - 1))}>-</button>
              <input type="number" id="level" value={level} readOnly />
              <button type="button" onClick={() => setLevel(Math.min(20, level + 1))}>+</button>
            </div>
            <div>
              <label htmlFor="hp">HP:</label>
              <input
                type="number"
                id="hp"
                value={hp}
                onChange={(e) => setHp(Number(e.target.value))}
              />
            </div>
          </div>
        )}
        {step === 3 && (
          <div>
            <h2>Choose Your Species <span style={{ color: 'red' }}>*</span></h2>
            <select value={selectedSpecies} onChange={(e) => setSelectedSpecies(e.target.value)}>
              <option value="">Select a species</option>
              {Object.keys(species).map((sp) => (
                <option key={sp} value={sp}>{sp}</option>
              ))}
            </select>
            {selectedSpecies && species[selectedSpecies].length > 0 && (
              <div>
                <h3>Choose Your Sub-Species <span style={{ color: 'red' }}>*</span></h3>
                <select value={selectedSubSpecies} onChange={(e) => setSelectedSubSpecies(e.target.value)}>
                  <option value="">Select a sub-species</option>
                  {species[selectedSpecies].map((subSp) => (
                    <option key={subSp} value={subSp}>{subSp}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
        {step === 4 && (
          <div>
            <h2>Choose Your Background <span style={{ color: 'red' }}>*</span></h2>
            <select value={selectedBackground} onChange={(e) => setSelectedBackground(e.target.value)}>
              <option value="">Select a background</option>
              {backgrounds.map((bg) => (
                <option key={bg} value={bg}>{bg}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          {step > 1 && <button type="button" onClick={handleBack}>Back</button>}
          {step < 4 && <button type="button" onClick={handleNext}>Next</button>}
          {step === 4 && <button type="submit">Create</button>}
        </div>
      </form>
    </div>
  );
};

export default CreateSheet;