document.addEventListener("DOMContentLoaded", function() {
  const dice = document.getElementById('dice');
  dice.src = '../assets/d20/20.empty.png';
});

function rollDice(sides) {
    // Gera um número aleatório entre 1 e o número de lados do dado
    const result = Math.floor(Math.random() * sides) + 1;
    const dice = document.getElementById('dice');
    const resultText = document.getElementById('result');
  
    // Define o número de imagens de rolagem baseado no tipo de dado
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
      }
    }, 100); // Muda a imagem a cada 100ms
  }
  