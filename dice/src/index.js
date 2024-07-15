document.addEventListener("DOMContentLoaded", function() {
  const dice = document.getElementById('dice-1');
  dice.src = '../assets/d20/20.empty.png';
});

let lastResults = {};
let diceCount = 1;
const maxDiceCount = 6;

function playRandomRollSound() {
  const soundIndex = Math.floor(Math.random() * 9) + 1; // Gera um número entre 1 e 9
  const audio = new Audio(`../sfx/roll${soundIndex}.mp3`); // Assumindo que os arquivos são nomeados como roll1.mp3, roll2.mp3, etc.
  audio.play();
}

function rollDice(id) {
  playRandomRollSound(); // Reproduz um som aleatório de rolagem
  const diceTypeSelect = document.getElementById(`dice-type-${id}`);
  const sides = parseInt(diceTypeSelect.value);
  let result;
  do {
    result = Math.floor(Math.random() * sides) + 1;
  } while (result === lastResults[id]);
  
  lastResults[id] = result;
  
  const dice = document.getElementById(`dice-${id}`);
  const resultText = document.getElementById(`result-${id}`);

  const rollImages = (sides === 8 || sides === 12) ? 7 : 8;
  let rollCount = 0;

  const rollInterval = setInterval(() => {
    rollCount++;
    if (rollCount <= rollImages) {
      dice.src = `../assets/d${sides}/roll${rollCount}.png`;
    } else {
      clearInterval(rollInterval);
      dice.src = `../assets/d${sides}/${sides}.${result}.png`;
      resultText.textContent = `Resultado: ${result}`;
      logResult(id, sides, result);
    }
  }, 100); // Muda a imagem a cada 100ms
}

function addDice() {
  if (diceCount < maxDiceCount) {
    diceCount++;
    const diceWrapper = document.getElementById('dice-wrapper');
    const newDiceContainer = document.createElement('div');
    newDiceContainer.classList.add('result-container');
    newDiceContainer.id = `dice-container-${diceCount}`;

    const newDiceImg = document.createElement('img');
    newDiceImg.id = `dice-${diceCount}`;
    newDiceImg.classList.add('dice');
    newDiceImg.src = '../assets/d20/20.empty.png';
    newDiceImg.alt = 'Dice result';
    newDiceContainer.appendChild(newDiceImg);

    const newResultText = document.createElement('p');
    newResultText.id = `result-${diceCount}`;
    newResultText.textContent = 'Resultado: ';
    newDiceContainer.appendChild(newResultText);

    const newDiceTypeSelect = document.createElement('select');
    newDiceTypeSelect.id = `dice-type-${diceCount}`;
    newDiceTypeSelect.innerHTML = `
      <option value="4">D4</option>
      <option value="6">D6</option>
      <option value="8">D8</option>
      <option value="10">D10</option>
      <option value="12">D12</option>
      <option value="20" selected>D20</option>
    `;
    newDiceContainer.appendChild(newDiceTypeSelect);

    const newRollButton = document.createElement('button');
    newRollButton.textContent = 'Rolar';
    newRollButton.onclick = (function(id) {
      return function() {
        rollDice(id);
      };
    })(diceCount);  // Closure para capturar o valor de diceCount
    newDiceContainer.appendChild(newRollButton);

    const newRemoveButton = document.createElement('button');
    newRemoveButton.textContent = 'Remover';
    newRemoveButton.onclick = (function(id) {
      return function() {
        removeDice(id);
      };
    })(diceCount);  // Closure para capturar o valor de diceCount
    newDiceContainer.appendChild(newRemoveButton);

    diceWrapper.appendChild(newDiceContainer);
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
