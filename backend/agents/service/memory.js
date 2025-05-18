import { supabase } from '../../config/supabase.js';

const memoryService = {
  // Add a new message to chat logs
  async addMessage(userId, agentName, role, content) {
    try {
      const { data, error } = await supabase
        .from('chat_logs')
        .insert([
          {
            user_id: userId,
            agent_id: agentName,
            role: role,
            content: content
          }
        ])
        .select();

      if (error) throw error;
      return data[0];
    } catch (error) {
      console.error('Error adding message:', error);
      throw error;
    }
  },

  // Get chat history for a specific agent
  async getChatHistory(userId, agentName) {
    try {
      const { data, error } = await supabase
        .from('chat_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('agent_id', agentName)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting chat history:', error);
      throw error;
    }
  },

  // Clear chat history for a specific agent
  async clearHistory(userId, agentName) {
    try {
      const { error } = await supabase
        .from('chat_logs')
        .delete()
        .eq('user_id', userId)
        .eq('agent_id', agentName);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error clearing history:', error);
      throw error;
    }
  }
};

export default memoryService; 