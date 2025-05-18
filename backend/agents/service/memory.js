import supabase from '../../supabase.js';

class MemoryService {
  constructor() {
    this.memoryCache = new Map(); // Cache for active conversations
  }

  // Get chat history for a user and agent
  async getChatHistory(userId, agentId, limit = 10) {
    try {
      const { data, error } = await supabase
        .from('chat_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      // Update cache
      const cacheKey = `${userId}-${agentId}`;
      this.memoryCache.set(cacheKey, data);

      return data;
    } catch (error) {
      console.error('Error getting chat history:', error);
      return [];
    }
  }

  // Add new message to chat history
  async addMessage(userId, agentId, role, content) {
    try {
      const { data, error } = await supabase
        .from('chat_logs')
        .insert([{
          user_id: userId,
          agent_id: agentId,
          role,
          content,
          created_at: new Date()
        }])
        .select()
        .single();

      if (error) throw error;

      // Update cache
      const cacheKey = `${userId}-${agentId}`;
      const history = this.memoryCache.get(cacheKey) || [];
      history.unshift(data);
      this.memoryCache.set(cacheKey, history.slice(0, 10));

      return data;
    } catch (error) {
      console.error('Error adding message:', error);
      return null;
    }
  }

  // Clear chat history for a user and agent
  async clearHistory(userId, agentId) {
    try {
      const { error } = await supabase
        .from('chat_logs')
        .delete()
        .eq('user_id', userId)
        .eq('agent_id', agentId);

      if (error) throw error;

      // Clear cache
      const cacheKey = `${userId}-${agentId}`;
      this.memoryCache.delete(cacheKey);

      return true;
    } catch (error) {
      console.error('Error clearing history:', error);
      return false;
    }
  }

  // Get conversation context for GPT
  async getConversationContext(userId, agentId) {
    const history = await this.getChatHistory(userId, agentId);
    return history.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }
}

export default new MemoryService(); 