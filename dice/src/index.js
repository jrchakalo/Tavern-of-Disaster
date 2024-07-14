function rollDice(sides) {
    const result = Math.floor(Math.random() * sides) + 1;
    const dice = document.getElementById('dice');
    const resultText = document.getElementById('result');
  
    // Define o número de imagens de rolagem baseado no tipo de dado
    const rollImages = (sides === 8 || sides === 12) ? 7 : 8;
  
    let rollCount = 0;
  
    const rollInterval = setInterval(() => {
      rollCount++;
      if (rollCount <= rollImages) {
        dice.src = `../assets/dices/d${sides}/sem fundo/roll${rollCount}.png`;
      } else {
        clearInterval(rollInterval);
        dice.src = `../assets/dices/d${sides}/sem fundo/${sides}.${result}.png`;
        resultText.textContent = `Resultado: ${result}`;
      }
    }, 100); // Muda a imagem a cada 100ms
  }
  