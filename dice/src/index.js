document.addEventListener("DOMContentLoaded", function() {
  const audioIcon = document.getElementById('audio-icon');
  audioIcon.src = '../assets/audio icon/audiooff.png';

  // Inicializa o dado inicial
  updateDiceImage(1);
  const diceSelects = document.querySelectorAll('[id^="dice-type-"]');
  diceSelects.forEach(select => {
    select.addEventListener('change', function() {
      const id = this.id.split('-')[2];
      updateDiceImage(id);
    });
  });
});

function updateDiceImage(id) {
  const diceTypeSelect = document.getElementById(`dice-type-${id}`);
  const sides = diceTypeSelect.value;
  const dice = document.getElementById(`dice-${id}`);
  dice.src = `../assets/d${sides}/${sides}.empty.png`;
}

let lastResults = {};
let diceCount = 1;
const maxDiceCount = 6;
let soundEnabled = false;

function playSound() {
  if (!soundEnabled) return;
  const soundIndex = Math.floor(Math.random() * 9) + 1;
  const audio = new Audio(`../sfx/roll${soundIndex}.mp3`);
  audio.play();
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  const audioIcon = document.getElementById('audio-icon');
  audioIcon.src = soundEnabled ? '../assets/audio icon/audioon.png' : '../assets/audio icon/audiooff.png';
}

function rollDice(id) {
  const diceTypeSelect = document.getElementById(`dice-type-${id}`);
  const sides = parseInt(diceTypeSelect.value);
  let result;
  do {
    result = Math.floor(Math.random() * sides) + 1;
  } while (result === lastResults[id]);

  lastResults[id] = result;

  const dice = document.getElementById(`dice-${id}`);
  const resultText = document.getElementById(`result-${id}`);

  // Duração do GIF em milissegundos
  const gifDuration = 800;

  // Reproduz som de rolagem
  playSound();

  // Define o GIF animado
  dice.src = `../assets/d${sides}/d${sides}gif.gif`;

  // Aguarda a duração do GIF antes de mostrar o resultado final
  setTimeout(() => {
    dice.src = `../assets/d${sides}/${sides}.${result}.png`;
    resultText.textContent = `Resultado: ${result}`;
    logResult(id, sides, result);
  }, gifDuration);
}

function addDice() {
  if (diceCount < maxDiceCount) {
    diceCount++;
    const currentDiceCount = diceCount; // Usando variável local para closures

    const diceWrapper = document.getElementById('dice-wrapper');
    const newDiceContainer = document.createElement('div');
    newDiceContainer.classList.add('result-container');
    newDiceContainer.id = `dice-container-${currentDiceCount}`;

    const newDiceImg = document.createElement('img');
    newDiceImg.id = `dice-${currentDiceCount}`;
    newDiceImg.classList.add('dice');
    newDiceImg.src = '../assets/d20/20.empty.png';
    newDiceImg.alt = 'Dice result';
    newDiceContainer.appendChild(newDiceImg);

    const newResultText = document.createElement('p');
    newResultText.id = `result-${currentDiceCount}`;
    newResultText.textContent = 'Resultado: ';
    newDiceContainer.appendChild(newResultText);

    const newDiceTypeSelect = document.createElement('select');
    newDiceTypeSelect.id = `dice-type-${currentDiceCount}`;
    newDiceTypeSelect.innerHTML = `
      <option value="4">D4</option>
      <option value="6">D6</option>
      <option value="8">D8</option>
      <option value="10">D10</option>
      <option value="12">D12</option>
      <option value="20" selected>D20</option>
    `;
    newDiceTypeSelect.addEventListener('change', function() {
      updateDiceImage(currentDiceCount);
    });
    newDiceContainer.appendChild(newDiceTypeSelect);

    const newRollButton = document.createElement('button');
    newRollButton.textContent = 'Rolar';
    newRollButton.addEventListener('click', function() {
      rollDice(currentDiceCount);
    });
    newDiceContainer.appendChild(newRollButton);

    const newRemoveButton = document.createElement('button');
    newRemoveButton.textContent = 'Remover';
    newRemoveButton.addEventListener('click', function() {
      removeDice(currentDiceCount);
    });
    newDiceContainer.appendChild(newRemoveButton);

    diceWrapper.appendChild(newDiceContainer);

    // Atualiza a imagem do novo dado para o estado inicial
    updateDiceImage(currentDiceCount);
  } else {
    alert('Número máximo de dados alcançado!');
  }
}

function removeDice(id) {
  if (diceCount > 1) {
    const diceContainer = document.getElementById(`dice-container-${id}`);
    diceContainer.remove();
    diceCount--;
    delete lastResults[id];
  } else {
    alert('Você deve ter pelo menos um dado!');
  }
}

function logResult(id, sides, result) {
  const logContent = document.getElementById('log-content');
  const logEntry = document.createElement('div');
  logEntry.textContent = `Dado ${id} (d${sides}): ${result}`;
  logContent.appendChild(logEntry);
}

function toggleLog() {
  const logContainer = document.getElementById('log-container');
  logContainer.classList.toggle('active');
  const toggleButton = document.getElementById('toggle-log-button');
  if (logContainer.classList.contains('active')) {
    toggleButton.textContent = 'Esconder Histórico';
  } else {
    toggleButton.textContent = 'Histórico';
  }
}
