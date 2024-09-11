import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    auth: {
      user: process.env.SENDINBLUE_USER,
      pass: process.env.SENDINBLUE_PASS,
    },
});

// Função para enviar email
export const sendEmail = async (to: string, subject: string, htmlContent: string) => {
    const mailOptions = {
      from: 'jisj@cin.ufpe.br', // Defina o remetente
      to,
      subject,
      html: htmlContent,
    };
  
    try {
      // Envia o email
      await transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Erro ao enviar o e-mail:', error);
      throw new Error('Erro ao enviar o e-mail.');
    }
};