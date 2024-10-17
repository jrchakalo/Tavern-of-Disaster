import { useState, useEffect } from 'react';
import { PDFDocument } from 'pdf-lib';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import './CreateSheet.css';

const CreateSheet = () => {
  const { tableCode } = useParams<{ tableCode: string }>(); // Pega o ID da URL
  const navigate = useNavigate();
  const [pdf, setPdf] = useState<Uint8Array | null>(null);
  const fichabase = '/assets/fichabase/fichabase.pdf';

  useEffect(() => {
    // Função para carregar o PDF base
    const loadPdf = async () => {
      try {
        // Carregar o PDF base da sua pasta public ou de algum local do backend
        const response = await fetch(fichabase);
        const pdfArrayBuffer = await response.arrayBuffer();
        setPdf(new Uint8Array(pdfArrayBuffer));
      } catch (error) {
        console.error('Erro ao carregar o PDF:', error);
      }
    };

    loadPdf();
  }, []);

  const handleSave = async () => {
    try {
      const pdfDoc = await PDFDocument.load(pdf!);
      const pdfBytes = await pdfDoc.save();
  
      const formData = new FormData();
      formData.append('file', new Blob([pdfBytes]), `ficha-${tableCode}.pdf`);
  
      const token = localStorage.getItem('token');
      const response = await api.post(
        `/players/save-pdf/${tableCode}`,  // A rota agora não precisa do characterName
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
  
      if (response.status === 200) {
        alert('Ficha salva com sucesso!');
        navigate(`/${tableCode}`);
      } else {
        alert('Erro ao salvar a ficha.');
      }
    } catch (error) {
      console.error('Erro ao salvar a ficha:', error);
    }
  };  

  if (!pdf) return <p>Carregando PDF...</p>;

  return (
    <div>
      <h1>Criação de Ficha</h1>
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
      <embed
        src={URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }))}
        type="application/pdf"
        style={{ width: '100vw', height: '100vh', border: 0, marginTop: 20, marginBottom: 20, marginLeft: 20, marginRight: 20 }}
      />
    </div>
      <button onClick={handleSave}>Salvar Ficha</button>
    </div>
  );
};

export default CreateSheet;