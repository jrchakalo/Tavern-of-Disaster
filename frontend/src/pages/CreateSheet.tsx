import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';

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

const classProficiencies = {
  'Bárbaro': { proficiencies: ['Athletics', 'Intimidation'], limit: 2 },
  'Bardo': { proficiencies: ['Deception', 'Performance', 'Persuasion', 'Sleight of Hand'], limit: 3 },
  'Bruxo': { proficiencies: ['Arcana', 'Deception', 'History', 'Intimidation', 'Investigation', 'Nature', 'Religion'], limit: 2 },
  'Clérigo': { proficiencies: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'], limit: 2 },
  'Druida': { proficiencies: ['Arcana', 'Animal Handling', 'Insight', 'Medicine', 'Nature', 'Perception', 'Religion', 'Survival'], limit: 2 },
  'Feiticeiro': { proficiencies: ['Arcana', 'Deception', 'Insight', 'Intimidation', 'Persuasion', 'Religion'], limit: 2 },
  'Guerreiro': { proficiencies: ['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Perception', 'Survival'], limit: 2 },
  'Ladino': { proficiencies: ['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Performance', 'Persuasion', 'Sleight of Hand', 'Stealth'], limit: 4 },
  'Mago': { proficiencies: ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Religion'], limit: 2 },
  'Monge': { proficiencies: ['Acrobatics', 'Athletics', 'History', 'Insight', 'Religion', 'Stealth'], limit: 2 },
  'Paladino': { proficiencies: ['Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion'], limit: 2 },
  'Ranger': { proficiencies: ['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival'], limit: 3 }
};

const backgroundProficiencies = {
  'Acólito': ['Insight', 'Religion'],
  'Charlatão': ['Deception', 'Sleight of Hand'],
  'Criminoso': ['Deception', 'Stealth'],
  'Artista': ['Acrobatics', 'Performance'],
  'Herói do Povo': ['Animal Handling', 'Survival'],
  'Artesão da Guilda': ['Insight', 'Persuasion'],
  'Eremita': ['Medicine', 'Religion'],
  'Nobre': ['History', 'Persuasion'],
  'Forasteiro': ['Athletics', 'Survival'],
  'Sábio': ['Arcana', 'History'],
  'Marinheiro': ['Athletics', 'Perception'],
  'Soldado': ['Athletics', 'Intimidation'],
  'Órfão': ['Sleight of Hand', 'Stealth']
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

const speciesTraits = {
  'Anão': { traits: '+2 Constitution', walk: 7.5 },
  'Elfo': { traits: '+2 Dexterity', walk: 9 },
  'Halfling': { traits: '+2 Dexterity', walk: 7.5 },
  'Meio-Elfo': { traits: '+2 Charisma, +1 to two other attributes', walk: 9 },
  'Draconato': { traits: '+2 Strength, +1 Charisma', walk: 9 },
  'Gnomo': { traits: '+2 Intelligence', walk: 7.5 },
  'Meio-Orc': { traits: '+2 Strength, +1 Constitution', walk: 9 },
  'Tiefling': { traits: '+2 Charisma, +1 Intelligence', walk: 9 },
  'Humano': { traits: '+1 to all attributes', walk: 9 },
  'Genasi': { traits: '+2 Constitution', walk: 9 },
  'Aarakocra': { traits: '+2 Dexterity, +1 Wisdom', walk: 7.5 },
  'Golias': { traits: '+2 Strength, +1 Constitution', walk: 9 }
};

type SubSpeciesTraitsType = {
  [key: string]: { traits: string; walk: number };
};

const subSpeciesTraits: SubSpeciesTraitsType = {
  'Anão da Colina': { traits: '+1 Wisdom', walk: 25 },
  'Anão da Montanha': { traits: '+2 Strength', walk: 25 },
  'Anão Cinzento (Duergar)': { traits: '+1 Strength', walk: 25 },
  'Alto Elfo': { traits: '+1 Intelligence', walk: 30 },
  'Elfo da Floresta': { traits: '+1 Wisdom', walk: 35 },
  'Elfo Negro (Drow)': { traits: '+1 Charisma', walk: 30 },
  'Halfling Robusto': { traits: '+1 Constitution', walk: 25 },
  'Halfling Pés Leves': { traits: '+1 Charisma', walk: 25 },
  'Halfling Fantasma': { traits: '+1 Dexterity', walk: 25 },
  'Descendência Elfo Alto': { traits: '+1 Intelligence', walk: 30 },
  'Descendência Elfo da Floresta': { traits: '+1 Wisdom', walk: 30 },
  'Descendência Elfo Negro': { traits: '+1 Charisma', walk: 30 },
  'Descendência Elfo Aquatico': { traits: '+1 Constitution', walk: 30 },
  'Gnomo da Floresta': { traits: '+1 Dexterity', walk: 25 },
  'Gnomo da Rocha': { traits: '+1 Constitution', walk: 25 },
  'Gnomo da Profundeza': { traits: '+1 Dexterity', walk: 25 },
  'Genasi da Água': { traits: '+1 Wisdom', walk: 30 },
  'Genasi da Terra': { traits: '+1 Strength', walk: 30 },
  'Genasi do Ar': { traits: '+1 Dexterity', walk: 30 },
  'Genasi do Fogo': { traits: '+1 Intelligence', walk: 30 }
};

const pointBuyCosts = [0, 1, 2, 3, 4, 5, 7, 9];

const CreateSheet: React.FC = () => {
  const navigate = useNavigate();
  const { tableCode } = useParams();
  const [step, setStep] = useState(1);
  const [selectedClass, setSelectedClass] = useState<keyof typeof hitDice | ''>('');
  const [level, setLevel] = useState(1);
  const [hp, setHp] = useState(0);
  const [selectedSpecies, setSelectedSpecies] = useState<keyof typeof species | ''>('');
  const [selectedSubSpecies, setSelectedSubSpecies] = useState<keyof typeof subSpeciesTraits | ''>('');
  const [selectedBackground, setSelectedBackground] = useState<keyof typeof backgroundProficiencies | ''>('');
  const [distributionMode, setDistributionMode] = useState<'preset' | 'pointBuy'>('preset');
  const [selectedAlignment, setSelectedAlignment] = useState('');
  const [attributes, setAttributes] = useState({
    strength: 8,
    dexterity: 8,
    constitution: 8,
    intelligence: 8,
    wisdom: 8,
    charisma: 8
  });
  const [presetValues, setPresetValues] = useState([15, 14, 13, 12, 10, 8]);
  const [points, setPoints] = useState(27);
  const [selectedProficiencies, setSelectedProficiencies] = useState<string[]>([]);
  const [characterName, setCharacterName] = useState('');

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
    if (step === 3 && (!selectedSpecies || (species[selectedSpecies].length > 0 && !selectedSubSpecies))) {
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const updatedAttributes = applyTraits();
  
    const characterData = {
      characterName: characterName,
      characterClass: selectedClass,
      characterSpecie: selectedSpecies,
      characterSubSpecie: selectedSubSpecies,
      characterLevel: level,
      characterBackground: selectedBackground,
      characterAlignment: selectedAlignment,
      characterExperience: 0, // Assuming experience starts at 0
      characterStrength: updatedAttributes.strength,
      characterDexterity: updatedAttributes.dexterity,
      characterConstitution: updatedAttributes.constitution,
      characterIntelligence: updatedAttributes.intelligence,
      characterWisdom: updatedAttributes.wisdom,
      characterCharisma: updatedAttributes.charisma,
      characterArmorClass: calculateArmorClass(),
      characterWalkSpeed: selectedSubSpecies ? subSpeciesTraits[selectedSubSpecies as keyof typeof subSpeciesTraits].walk : speciesTraits[selectedSpecies as keyof typeof speciesTraits].walk,
      characterProficiencies: selectedProficiencies,
      characterTraits: selectedSubSpecies ? subSpeciesTraits[selectedSubSpecies as keyof typeof subSpeciesTraits].traits : speciesTraits[selectedSpecies as keyof typeof speciesTraits].traits,
      characterHP: hp
    };
  
    try {
      const token = localStorage.getItem('token');
      const response = await api.post(`players/create-sheet/${tableCode}`, characterData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
  
      if (response.status === 200) {
        const result = response.data;
        alert(result.message);
        navigate(`/${tableCode}`);
      } else {
        const error = response.data;
        alert('Error creating character sheet: ' + error);
        navigate(`/${tableCode}/create-sheet`);
      }
    } catch (error) {
      alert('Error creating character sheet: ' + error);
      navigate(`/${tableCode}/create-sheet`);
    }
  };

  const handleAttributeChange = (attribute: keyof typeof attributes, value: number) => {
    const cost = pointBuyCosts[value - 8];
    const currentCost = pointBuyCosts[attributes[attribute] - 8];
    const newPoints = points - (cost - currentCost);
    if (newPoints >= 0 && value >= 4 && value <= 15) {
      setAttributes((prev) => ({ ...prev, [attribute]: value }));
      setPoints(newPoints);
    }
  };

  const handlePresetChange = (attribute: keyof typeof attributes, value: number) => {
    setAttributes((prev) => {
      const newAttributes = { ...prev, [attribute]: prev[attribute] === value ? 8 : value };
      const usedValues = Object.values(newAttributes);
      setPresetValues([15, 14, 13, 12, 10, 8].filter((v) => !usedValues.includes(v)));
      return newAttributes;
    });
  };

  const handleDistributionModeChange = (mode: 'preset' | 'pointBuy') => {
    setDistributionMode(mode);
    setAttributes({
      strength: 8,
      dexterity: 8,
      constitution: 8,
      intelligence: 8,
      wisdom: 8,
      charisma: 8
    });
    setPoints(27);
    setPresetValues([15, 14, 13, 12, 10, 8]);
  };

  const handleProficiencyChange = (proficiency: string) => {
    setSelectedProficiencies((prev) => {
      if (prev.includes(proficiency)) {
        return prev.filter((p) => p !== proficiency);
      } else {
        return [...prev, proficiency];
      }
    });
  };

  const calculateModifier = (value: number) => {
    return Math.floor((value - 10) / 2);
  };

  const calculateArmorClass = () => {
    return 10 + calculateModifier(attributes.dexterity);
  };

  const applyTraits = () => {
    const newAttributes = { ...attributes };
  
    switch (selectedSpecies) {
      case 'Anão':
        newAttributes.constitution += 2;
        break;
      case 'Elfo':
        newAttributes.dexterity += 2;
        break;
      case 'Halfling':
        newAttributes.dexterity += 2;
        break;
      case 'Meio-Elfo':
        newAttributes.charisma += 2;
        // +1 to two other attributes, this needs user input to decide which two
        break;
      case 'Draconato':
        newAttributes.strength += 2;
        newAttributes.charisma += 1;
        break;
      case 'Gnomo':
        newAttributes.intelligence += 2;
        break;
      case 'Meio-Orc':
        newAttributes.strength += 2;
        newAttributes.constitution += 1;
        break;
      case 'Tiefling':
        newAttributes.charisma += 2;
        newAttributes.intelligence += 1;
        break;
      case 'Humano':
        newAttributes.strength += 1;
        newAttributes.dexterity += 1;
        newAttributes.constitution += 1;
        newAttributes.intelligence += 1;
        newAttributes.wisdom += 1;
        newAttributes.charisma += 1;
        break;
      case 'Genasi':
        newAttributes.constitution += 2;
        break;
      case 'Aarakocra':
        newAttributes.dexterity += 2;
        newAttributes.wisdom += 1;
        break;
      case 'Golias':
        newAttributes.strength += 2;
        newAttributes.constitution += 1;
        break;
      default:
        break;
    }
  
    switch (selectedSubSpecies) {
      case 'Anão da Colina':
        newAttributes.wisdom += 1;
        break;
      case 'Anão da Montanha':
        newAttributes.strength += 2;
        break;
      case 'Anão Cinzento (Duergar)':
        newAttributes.strength += 1;
        break;
      case 'Alto Elfo':
        newAttributes.intelligence += 1;
        break;
      case 'Elfo da Floresta':
        newAttributes.wisdom += 1;
        break;
      case 'Elfo Negro (Drow)':
        newAttributes.charisma += 1;
        break;
      case 'Halfling Robusto':
        newAttributes.constitution += 1;
        break;
      case 'Halfling Pés Leves':
        newAttributes.charisma += 1;
        break;
      case 'Halfling Fantasma':
        newAttributes.dexterity += 1;
        break;
      case 'Descendência Elfo Alto':
        newAttributes.intelligence += 1;
        break;
      case 'Descendência Elfo da Floresta':
        newAttributes.wisdom += 1;
        break;
      case 'Descendência Elfo Negro':
        newAttributes.charisma += 1;
        break;
      case 'Descendência Elfo Aquatico':
        newAttributes.constitution += 1;
        break;
      case 'Gnomo da Floresta':
        newAttributes.dexterity += 1;
        break;
      case 'Gnomo da Rocha':
        newAttributes.constitution += 1;
        break;
      case 'Gnomo da Profundeza':
        newAttributes.dexterity += 1;
        break;
      case 'Genasi da Água':
        newAttributes.wisdom += 1;
        break;
      case 'Genasi da Terra':
        newAttributes.strength += 1;
        break;
      case 'Genasi do Ar':
        newAttributes.dexterity += 1;
        break;
      case 'Genasi do Fogo':
        newAttributes.intelligence += 1;
        break;
      default:
        break;
    }
  
    return newAttributes;
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
            <h2>Choose Your Background and Alignment<span style={{ color: 'red' }}>*</span></h2>
            <select value={selectedBackground} onChange={(e) => setSelectedBackground(e.target.value as keyof typeof backgroundProficiencies)}>
              <option value="">Select a background</option>
              {backgrounds.map((bg) => (
                <option key={bg} value={bg}>{bg}</option>
              ))}
            </select>
            <div>
              <select value={selectedAlignment} onChange={(e) => setSelectedAlignment(e.target.value)}>
              <option value="">Select an alignment</option>
              <option value="Lawful Good">Lawful Good</option>
              <option value="Neutral Good">Neutral Good</option>
              <option value="Chaotic Good">Chaotic Good</option>
              <option value="Lawful Neutral">Lawful Neutral</option>
              <option value="True Neutral">True Neutral</option>
              <option value="Chaotic Neutral">Chaotic Neutral</option>
              <option value="Lawful Evil">Lawful Evil</option>
              <option value="Neutral Evil">Neutral Evil</option>
              <option value="Chaotic Evil">Chaotic Evil</option>
              </select>
            </div>
          </div>
        )}
        {step === 5 && (
          <div>
            <h2>Distribute Your Points</h2>
            <div>
              <label>
                <input
                  type="radio"
                  name="distributionMode"
                  value="preset"
                  checked={distributionMode === 'preset'}
                  onChange={() => handleDistributionModeChange('preset')}
                />
                Preset
              </label>
              <label>
                <input
                  type="radio"
                  name="distributionMode"
                  value="pointBuy"
                  checked={distributionMode === 'pointBuy'}
                  onChange={() => handleDistributionModeChange('pointBuy')}
                />
                Point Buy
              </label>
            </div>
            <div>
              {['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].map((attr) => (
                <div key={attr}>
                  <label>{attr.charAt(0).toUpperCase() + attr.slice(1)}</label>
                  {distributionMode === 'preset' ? (
                    <div>
                      <select
                        value={attributes[attr as keyof typeof attributes]}
                        onChange={(e) => handlePresetChange(attr as keyof typeof attributes, Number(e.target.value))}
                      >
                        <option value={attributes[attr as keyof typeof attributes]}>
                          {attributes[attr as keyof typeof attributes]}
                        </option>
                        {presetValues.map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <input
                      type="number"
                      value={attributes[attr as keyof typeof attributes]}
                      onChange={(e) => handleAttributeChange(attr as keyof typeof attributes, Number(e.target.value))}
                      min={4}
                      max={15}
                    />
                  )}
                  <span>Modifier: {calculateModifier(attributes[attr as keyof typeof attributes])}</span>
                </div>
              ))}
            </div>
            {distributionMode === 'pointBuy' && (
              <div>
                <p>Points remaining: {points}</p>
              </div>
            )}
            <button type="button" onClick={() => handleDistributionModeChange(distributionMode)}>Reset All</button>
          </div>
        )}
        {step === 6 && (
          <div>
            <h2>Select Your Proficiencies</h2>
            <div>
              <h3>Background Proficiencies</h3>
              <ul>
                {backgroundProficiencies[selectedBackground as keyof typeof backgroundProficiencies]?.map((prof) => (
                  <li key={prof}>{prof}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Class Proficiencies</h3>
              <ul>
                {selectedClass && classProficiencies[selectedClass]?.proficiencies.map((prof) => (
                  <li key={prof}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedProficiencies.includes(prof)}
                        onChange={() => handleProficiencyChange(prof)}
                        disabled={!selectedProficiencies.includes(prof) && selectedProficiencies.length >= classProficiencies[selectedClass]?.limit}
                      />
                      {prof}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {step === 7 && (
          <div>
            <h2>Finalize Your Character</h2>
            <div>
              <label>Character Name:</label>
              <input
                type="text"
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
              />
            </div>
            <div>
              <h3>Character Information</h3>
              <p>Name: {characterName}</p>
              <p>Class: {selectedClass}</p>
              <p>Level: {level}</p>
              <p>HP: {hp}</p>
              <p>Species: {selectedSpecies}</p>
              {selectedSubSpecies && <p>Sub-Species: {selectedSubSpecies}</p>}
              <p>Background: {selectedBackground}</p>
              {Object.entries(applyTraits()).map(([attr, value]) => (
                <p key={attr}>{attr.charAt(0).toUpperCase() + attr.slice(1)}: {value} (Modifier: {calculateModifier(value)})</p>
              ))}
              <p>Alignment: {selectedAlignment}</p>
              <p>Armor Class: {calculateArmorClass()}</p>
              <p>Walk Distance: {speciesTraits[selectedSpecies as keyof typeof speciesTraits].walk} meters</p>
              <p>Traits: {selectedSubSpecies ? subSpeciesTraits[selectedSubSpecies as keyof typeof subSpeciesTraits].traits : speciesTraits[selectedSpecies as keyof typeof speciesTraits].traits}</p>
            </div>
          </div>
        )}
        <div>
          {step > 1 && <button type="button" onClick={handleBack}>Back</button>}
          {step < 7 && <button type="button" onClick={handleNext}>Next</button>}
            {step === 7 && <button type="submit" onClick={handleSubmit}>Create</button>}
        </div>
      </form>
    </div>
  );
};

export default CreateSheet;