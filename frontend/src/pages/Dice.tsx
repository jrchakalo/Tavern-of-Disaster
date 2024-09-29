import { useState, useEffect } from 'react';
import Header from '../components/Header';
import './Dice.css';

const Dice = () => {
  const [diceCount, setDiceCount] = useState(1);
  const [lastResults, setLastResults] = useState<{ [key: string]: number }>({});
  const [soundEnabled, setSoundEnabled] = useState(false);
  const maxDiceCount = 6;

  useEffect(() => {
    updateDiceImage(1);
  }, []);

  const updateDiceImage = (id: number) => {
    const sides = (document.getElementById(`dice-type-${id}`) as HTMLSelectElement).value;
    const dice = document.getElementById(`dice-${id}`) as HTMLImageElement;
    dice.src = `./assets/d${sides}/${sides}.empty.png`;
  };

  const playSound = () => {
    if (!soundEnabled) return;
    const soundIndex = Math.floor(Math.random() * 9) + 1;
    const audio = new Audio(`./sfx/roll${soundIndex}.mp3`);
    audio.volume = 0.05;
    audio.play();
  };

  const toggleSound = () => {
    setSoundEnabled(!soundEnabled);
    const audioIcon = document.getElementById('audio-icon') as HTMLImageElement;
    audioIcon.src = soundEnabled ? './assets/audio icon/audiooff.png' : './assets/audio icon/audioon.png';
  };

  const rollDice = (id: number) => {
    const diceTypeSelect = document.getElementById(`dice-type-${id}`) as HTMLSelectElement;
    const sides = parseInt(diceTypeSelect.value);
    let result: number;
    do {
      result = Math.floor(Math.random() * sides) + 1;
    } while (result === lastResults[id]);

    setLastResults((prevResults) => ({
      ...prevResults,
      [id]: result,
    }));

    const dice = document.getElementById(`dice-${id}`) as HTMLImageElement;
    
    const gifDuration = 1000;

    playSound();

    dice.src = `./assets/d${sides}/d${sides}gif.gif`;

    setTimeout(() => {
      dice.src = `./assets/d${sides}/${sides}.${result}.png`;
      logResult(id, sides, result);
    }, gifDuration);
  };

  const addDice = () => {
    if (diceCount < maxDiceCount) {
      setDiceCount(diceCount + 1);
    } else {
      alert('Número máximo de dados alcançado!');
    }
  };

  const removeDice = (id: number) => {
    if (diceCount > 1) {
      setDiceCount(diceCount - 1);
      setLastResults((prevResults) => {
        const newResults = { ...prevResults };
        delete newResults[id];
        return newResults;
      });
    } else {
      alert('Você deve ter pelo menos um dado!');
    }
  };

  const logResult = (id: number, sides: number, result: number) => {
    const logContent = document.getElementById('log-content') as HTMLDivElement;
    const logEntry = document.createElement('div');
    logEntry.textContent = `Dado ${id} (d${sides}): ${result}`;
    logContent.appendChild(logEntry);
  };

  const toggleLog = () => {
    const logContainer = document.getElementById('log-container') as HTMLDivElement;
    logContainer.classList.toggle('active');
    const toggleButton = document.getElementById('toggle-log-button') as HTMLButtonElement;
    toggleButton.textContent = logContainer.classList.contains('active') ? 'Esconder Histórico' : 'Histórico';
  };

  return (
    <div className="dice-page">
      <Header />
      <div className="container">
        
        <div className="audio-toggle" id="audio-toggle" onClick={toggleSound}>
          <img id="audio-icon" src="./assets/audio icon/audiooff.png" alt="Toggle Audio" />
        </div>
        <h1>Role o Seu Dado!</h1>
        <div className="dice-wrapper" id="dice-wrapper">
          {[...Array(diceCount)].map((_, i) => (
            <div key={i} className="result-container" id={`dice-container-${i + 1}`}>
              <img id={`dice-${i + 1}`} className="dice" src={`./assets/d20/20.empty.png`} alt="Dice result" />
              <select id={`dice-type-${i + 1}`} onChange={() => updateDiceImage(i + 1)}>
                <option value="4">D4</option>
                <option value="6">D6</option>
                <option value="8">D8</option>
                <option value="10">D10</option>
                <option value="12">D12</option>
                <option value="20" selected>
                  D20
                </option>
              </select>
              <button onClick={() => rollDice(i + 1)}>Rolar</button>
              <button onClick={() => removeDice(i + 1)}>Remover</button>
            </div>
          ))}
        </div>
        <button id="add-dice-button" onClick={addDice}>
          Adicionar mais dados
        </button>
        <button id="toggle-log-button" onClick={toggleLog}>
          Histórico
        </button>
        <div id="log-container" className="hidden">
          <h2>Histórico de Rolagens</h2>
          <div id="log-content"></div>
        </div>
      </div>
    </div>
  );
};

export default Dice;