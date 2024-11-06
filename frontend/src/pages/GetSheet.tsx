import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import Header from '../components/Header';

const GetSheet: React.FC = () => {
  const { tableCode } = useParams<{ tableCode: string }>();
  const navigate = useNavigate();
  interface CharacterSheet {
    name: string;
    class: string;
    level: number;
    hp: number;
    species: string;
    subSpecies?: string;
    background: string;
    alignment: string;
    str: number;
    dex: number;
    con: number;
    inte: number;
    wis: number;
    char: number;
    ac: number;
    walk: number;
    traits: string;
    prof: string[];
  }

  const [characterSheet, setCharacterSheet] = useState<CharacterSheet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCharacterSheet = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await api.get(`/players/get-sheet/${tableCode}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.status === 200) {
          setCharacterSheet(response.data);
        } else {
          setError('Error fetching character sheet');
        }
      } catch (error) {
        console.error('Error fetching character sheet:', error);
        setError('Error fetching character sheet');
      }
    };

    fetchCharacterSheet();
  }, [tableCode]);

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!characterSheet) {
    return <div>Loading...</div>;
  }

  return (
    <div style={{ paddingTop: '100px' }}>
      <Header />
      <h1>Character Sheet</h1>
      <p>Name: {characterSheet.name}</p>
      <p>Class: {characterSheet.class}</p>
      <p>Level: {characterSheet.level}</p>
      <p>HP: {characterSheet.hp}</p>
      <p>Species: {characterSheet.species}</p>
      {characterSheet.subSpecies && <p>Sub-Species: {characterSheet.subSpecies}</p>}
      <p>Background: {characterSheet.background}</p>
      <p>Alignment: {characterSheet.alignment}</p>
      <p>Strength: {characterSheet.str} (Modifier: {Math.floor((characterSheet.str - 10) / 2)})</p>
      <p>Dexterity: {characterSheet.dex} (Modifier: {Math.floor((characterSheet.dex - 10) / 2)})</p>
      <p>Constitution: {characterSheet.con} (Modifier: {Math.floor((characterSheet.con - 10) / 2)})</p>
      <p>Intelligence: {characterSheet.inte} (Modifier: {Math.floor((characterSheet.inte - 10) / 2)})</p>
      <p>Wisdom: {characterSheet.wis} (Modifier: {Math.floor((characterSheet.wis - 10) / 2)})</p>
      <p>Charisma: {characterSheet.char} (Modifier: {Math.floor((characterSheet.char - 10) / 2)})</p>
      <p>Armor Class: {characterSheet.ac}</p>
      <p>Walk Distance: {characterSheet.walk} meters</p>
      <p>Traits: {characterSheet.traits}</p>
      <p>Proficiencies: {characterSheet.prof.join(', ')}</p>
      <button onClick={() => navigate(`/${tableCode}`)}>Back to Table</button>
    </div>
  );
};

export default GetSheet;